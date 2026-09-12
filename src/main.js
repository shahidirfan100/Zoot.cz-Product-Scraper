import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { chromium } from 'patchright';

const BASE_URL = 'https://www.zoot.cz';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_REQUEST_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 5000;
const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 20;

await Actor.init();

function toPositiveInteger(value, fallback) {
    return Number.isFinite(Number(value)) && Number(value) > 0
        ? Math.floor(Number(value))
        : fallback;
}

function buildKeywordPath(keyword) {
    return String(keyword)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => encodeURIComponent(part))
        .join('+');
}

function ensureTrailingSlash(url) {
    return url.endsWith('/') ? url : `${url}/`;
}

function absoluteUrl(url) {
    if (!url) return undefined;
    return new URL(url, BASE_URL).toString();
}

function normalizeAssetUrl(url) {
    if (!url) return undefined;
    if (url.startsWith('//')) return `https:${url}`;
    return absoluteUrl(url);
}

function normalizeStartUrl(url) {
    const absolute = new URL(String(url).trim(), BASE_URL);
    absolute.hash = '';
    absolute.pathname = absolute.pathname.replace(/\/strana:\d+\/?$/u, '/');
    absolute.pathname = absolute.pathname.replace(/\/+/gu, '/');
    return ensureTrailingSlash(absolute.toString());
}

function normalizeInputValue(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
}

function buildStartUrl({ url, keyword }) {
    if (url) return normalizeStartUrl(url);
    if (keyword) return `${BASE_URL}/vyhledavani/hledani:${buildKeywordPath(keyword)}/`;
    throw new Error('Missing required input: provide either "url" or "keyword".');
}

function getInputMode(url, keyword) {
    if (url) return 'url';
    if (keyword) return 'keyword';
    return undefined;
}

function normalizeProxyConfiguration(proxyConfiguration) {
    if (!proxyConfiguration || Array.isArray(proxyConfiguration.apifyProxyGroups)
        || !Array.isArray(proxyConfiguration.ApifyProxyGroups)) {
        return proxyConfiguration;
    }

    const { ApifyProxyGroups, ...normalized } = proxyConfiguration;
    return { ...normalized, apifyProxyGroups: ApifyProxyGroups };
}

function getConfiguredProxyGroups(proxyConfiguration) {
    if (Array.isArray(proxyConfiguration?.groups)) return proxyConfiguration.groups;
    if (Array.isArray(proxyConfiguration?.apifyProxyGroups)) return proxyConfiguration.apifyProxyGroups;
    return [];
}

function buildBrowserProxyOptions(proxyUrl) {
    if (!proxyUrl) return undefined;

    const parsedProxyUrl = new URL(proxyUrl);
    const proxy = {
        server: `${parsedProxyUrl.protocol}//${parsedProxyUrl.host}`,
    };

    if (parsedProxyUrl.username) proxy.username = decodeURIComponent(parsedProxyUrl.username);
    if (parsedProxyUrl.password) proxy.password = decodeURIComponent(parsedProxyUrl.password);

    return proxy;
}

function isBrowserCrashError(error) {
    return /Target crashed|Target page, context or browser has been closed|Browser has been closed/iu.test(
        String(error?.message || error),
    );
}

async function createBrowserSession(proxy) {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'zoot-patchright-'));
    let context;

    try {
        context = await chromium.launchPersistentContext(profileDirectory, {
            channel: 'chrome',
            headless: false,
            noViewport: true,
            ...(proxy && { proxy }),
        });
        const page = await context.newPage();
        return { context, page, profileDirectory };
    } catch (error) {
        await context?.close().catch(() => {});
        await rm(profileDirectory, { recursive: true, force: true });
        throw error;
    }
}

async function closeBrowserSession(session) {
    await session?.page?.close().catch(() => {});
    await session?.context?.close().catch(() => {});
    await rm(session?.profileDirectory, { recursive: true, force: true });
}

function buildPageUrl(startUrl, pageNumber) {
    if (pageNumber === 1) return startUrl;

    const pageUrl = new URL(startUrl);
    pageUrl.pathname = `${pageUrl.pathname.replace(/\/$/u, '')}/strana:${pageNumber}/`;
    return pageUrl.toString();
}

function cleanText(value) {
    return value
        ?.replace(/&nbsp;/gu, ' ')
        ?.replace(/<[^>]+>/gu, ' ')
        ?.replace(/\s+/gu, ' ')
        ?.trim();
}

function parseMoney(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

    const normalized = String(value)
        .replace(/&nbsp;/gu, ' ')
        .replace(/[^\d.,-]/gu, '')
        .replace(/\s+/gu, '')
        .replace(',', '.');

    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function uniqueNonEmpty(values) {
    return [...new Set(values.map((value) => cleanText(String(value))).filter(Boolean))];
}

function extractJsonAssignment(html, variableName) {
    const match = html.match(new RegExp(`var\\s+${variableName}\\s*=\\s*(\\[.*?\\]);`, 'su'));
    if (!match) {
        throw new Error(`Could not find ${variableName} payload in HTML response.`);
    }

    return JSON.parse(match[1]);
}

function extractPushDataInfo(html) {
    const pushDataInfo = {};
    const pattern = /pushDataInfo\["([^"]+)"\]\s*=\s*(\{.*?\});/gu;

    for (const match of html.matchAll(pattern)) {
        try {
            pushDataInfo[match[1]] = JSON.parse(match[2]);
        } catch {
            continue;
        }
    }

    return pushDataInfo;
}

function extractProductCards(html) {
    const cards = new Map();
    const articleBlocks = html.match(/<article\b[\s\S]*?class="[^"]*\bb-product\b[^"]*"[\s\S]*?<\/article>/giu) || [];

    for (const block of articleBlocks) {
        const productKeyMatch = block.match(/data-push="([^"]+)"/iu);
        const detailUrlMatch = block.match(/<h3 class="b-product__title"><a\s+href="([^"]+)"/iu);
        const nameMatch = block.match(/<p class="b-product__desc">\s*([\s\S]*?)\s*<\/p>/iu);
        const brandMatch = block.match(/<h3 class="b-product__title"><a[\s\S]*?>\s*([\s\S]*?)\s*<\/a><\/h3>/iu);
        const currentPriceMatch = block.match(/price-eu__discounted[\s\S]*?<strong class="price-eu__amount">\s*([\s\S]*?)\s*<\/strong>/iu);
        const fullPriceMatch = block.match(/price-eu__original[\s\S]*?<span class="price-eu__amount">\s*([\s\S]*?)\s*<\/span>/iu);
        const lowestPriceMatch = block.match(/price-eu__rrp__prefix">\s*Nejnižší cena za posledních 30 dní:&nbsp;([\s\S]*?)\s*<\/p>/iu);
        const images = uniqueNonEmpty(
            [...block.matchAll(/<(?:img|source)[^>]+(?:src|srcset)="([^"\s,>]+)"/giu)]
                .map((match) => normalizeAssetUrl(match[1])),
        );
        const sizesAvailable = uniqueNonEmpty(
            [...block.matchAll(/<span\s+class="btn__inner">\s*([^<]+?)\s*<\/span>/giu)]
                .map((match) => match[1]),
        );
        const productKey = productKeyMatch?.[1];

        if (!productKey) continue;

        cards.set(productKey, {
            detail_url: absoluteUrl(detailUrlMatch?.[1]),
            name: cleanText(nameMatch?.[1]),
            brand: cleanText(brandMatch?.[1]),
            image: images[0],
            images,
            sizes_available: sizesAvailable,
            sizes_available_text: sizesAvailable.join(', '),
            full_price_czk: parseMoney(fullPriceMatch?.[1]),
            current_price_from_card_czk: parseMoney(currentPriceMatch?.[1]),
            lowest_30d_price_czk: parseMoney(lowestPriceMatch?.[1]),
        });
    }

    return cards;
}

function cleanValue(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || undefined;
    }
    if (Array.isArray(value)) {
        const cleanedArray = value
            .map((item) => cleanValue(item))
            .filter((item) => item !== undefined);
        return cleanedArray.length ? cleanedArray : undefined;
    }
    if (typeof value === 'object') {
        const cleanedEntries = Object.entries(value)
            .map(([key, item]) => [key, cleanValue(item)])
            .filter(([, item]) => item !== undefined);
        return cleanedEntries.length ? Object.fromEntries(cleanedEntries) : undefined;
    }

    return value;
}

function cleanRecord(record) {
    return Object.fromEntries(
        Object.entries(record)
            .map(([key, value]) => [key, cleanValue(value)])
            .filter(([, value]) => value !== undefined),
    );
}

function inferPrimaryColor(productKey) {
    if (!productKey?.includes('|||')) return undefined;
    return cleanText(productKey.split('|||')[1]);
}

function inferProductGroup(productKey) {
    const match = String(productKey).match(/^(\d+)/u);
    return match?.[1];
}

function buildRecord({
    impression,
    listingInfo,
    card,
    pageNumber,
    fallbackCategoryPath,
    fallbackCategoryUrl,
    searchKeyword,
}) {
    const productKey = String(impression?.id || impression?.zootId || impression?.ident || '');
    const currentPriceCzk = parseMoney(listingInfo?.priceVAT ?? impression?.metric1 ?? card?.current_price_from_card_czk);
    const salePriceCzk = parseMoney(listingInfo?.price);
    const fullPriceCzk = parseMoney(card?.full_price_czk);
    const color = inferPrimaryColor(productKey);
    const colorsAvailable = color ? [color] : undefined;
    const discountAmountCzk = fullPriceCzk && currentPriceCzk && fullPriceCzk > currentPriceCzk
        ? Number((fullPriceCzk - currentPriceCzk).toFixed(2))
        : undefined;
    const discountPercent = fullPriceCzk && currentPriceCzk && fullPriceCzk > currentPriceCzk
        ? Math.round(((fullPriceCzk - currentPriceCzk) / fullPriceCzk) * 100)
        : undefined;
    const sizesAvailable = card?.sizes_available;

    return cleanRecord({
        product_id: impression?.zootId || impression?.ident || listingInfo?.ident,
        listing_variant_key: productKey,
        product_group: inferProductGroup(productKey),
        ean: impression?.ean,
        name: listingInfo?.name || card?.name,
        brand: listingInfo?.brand || card?.brand,
        brand_id: impression?.brandId,
        category_path: listingInfo?.category || fallbackCategoryPath,
        category_url: fallbackCategoryUrl,
        color,
        colors_available: colorsAvailable,
        colors_available_text: colorsAvailable?.join(', '),
        sizes_available: sizesAvailable,
        sizes_available_text: card?.sizes_available_text,
        in_stock: /^skladem$/iu.test(String(listingInfo?.variant || impression?.variant || '')),
        stock_label: listingInfo?.variant || impression?.variant,
        currency: 'CZK',
        current_price_czk: currentPriceCzk,
        sale_price_czk: salePriceCzk,
        full_price_czk: fullPriceCzk,
        discount_amount_czk: discountAmountCzk,
        discount_percent: discountPercent,
        lowest_30d_price_czk: card?.lowest_30d_price_czk,
        image: card?.image,
        images: card?.images,
        url: card?.detail_url,
        listing_position: impression?.position || listingInfo?.pos,
        listing_page: pageNumber,
        search_keyword: searchKeyword || undefined,
        source: 'zoot.cz',
    });
}

function isRetryableError(error) {
    if (error?.retryable !== undefined) return error.retryable;

    return [
        'ECONNRESET',
        'ECONNREFUSED',
        'EAI_AGAIN',
        'ENETUNREACH',
        'EPIPE',
        'ETIMEDOUT',
        'ESOCKETTIMEDOUT',
    ].includes(error?.code) || error?.name === 'TimeoutError';
}

function getRetryAfterMs(value) {
    if (!value) return undefined;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }

    const dateMs = Date.parse(value);
    return Number.isNaN(dateMs) ? undefined : Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_DELAY_MS);
}

function getBackoffDelayMs(attempt) {
    const baseDelay = Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
    return Math.floor(baseDelay * (0.5 + Math.random() * 0.5));
}

async function fetchHtml(page, url) {
    for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES + 1; attempt++) {
        try {
            const response = await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: REQUEST_TIMEOUT_MS,
            });
            const statusCode = response?.status();

            if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300) {
                const requestError = new Error(`HTTP ${statusCode || 'unknown'} response`);
                requestError.retryable = statusCode === 429 || statusCode >= 500;
                requestError.retryAfterMs = getRetryAfterMs(response?.headers()?.['retry-after']);
                throw requestError;
            }

            let body;
            try {
                await page.waitForFunction(
                    () => {
                        const html = document.documentElement?.outerHTML || '';
                        return html.includes('dataLayer') && !html.includes('/.within.website/');
                    },
                    { timeout: REQUEST_TIMEOUT_MS },
                );
                try {
                    await page.waitForLoadState('networkidle', { timeout: REQUEST_TIMEOUT_MS });
                } catch {
                    log.warning('Listing page did not reach network idle before the timeout.');
                }
                body = await page.content();
            } catch {
                body = await page.content();
                const challengeError = new Error(
                    body.includes('/.within.website/')
                        ? 'Target anti-bot challenge did not complete in the browser'
                        : 'Listing payload did not load in the browser',
                );
                challengeError.retryable = body.includes('/.within.website/');
                throw challengeError;
            }

            if (!body.trim()) {
                const responseError = new Error('Empty or invalid HTML response');
                responseError.retryable = false;
                throw responseError;
            }

            return body;
        } catch (error) {
            if (!isRetryableError(error) || attempt > MAX_REQUEST_RETRIES) throw error;

            const delayMs = error.retryAfterMs ?? getBackoffDelayMs(attempt);
            log.warning(`Retrying listing request ${attempt}/${MAX_REQUEST_RETRIES} after ${delayMs}ms`, {
                reason: error.message,
            });
            await new Promise((resolve) => {
                setTimeout(resolve, delayMs);
            });
        }
    }

    throw new Error('Listing request retry limit exhausted.');
}

async function main() {
    let input = (await Actor.getInput()) || {};
    if (!Object.keys(input).length) {
        try {
            input = JSON.parse(await readFile(new URL('../INPUT.json', import.meta.url), 'utf8'));
            log.info('Loaded local INPUT.json because no runtime input was provided.');
        } catch {
            input = {};
        }
    }

    const url = normalizeInputValue(input.url);
    const keyword = normalizeInputValue(input.keyword);
    const resultsWanted = toPositiveInteger(input.results_wanted, DEFAULT_RESULTS_WANTED);
    const maxPages = toPositiveInteger(input.max_pages, DEFAULT_MAX_PAGES);
    const inputMode = getInputMode(url, keyword);

    if (url && keyword) {
        log.warning('Both "url" and "keyword" were provided; using the URL search mode.');
    }

    const startUrl = buildStartUrl({ url, keyword });
    const proxyConfigurationInput = normalizeProxyConfiguration(input.proxyConfiguration);
    const isApifyCloud = Actor.isAtHome();
    const hasCustomProxyUrls = Array.isArray(proxyConfigurationInput?.proxyUrls)
        && proxyConfigurationInput.proxyUrls.length > 0;
    const configuredGroups = getConfiguredProxyGroups(proxyConfigurationInput);
    const requestedApifyProxy = proxyConfigurationInput?.useApifyProxy === true || configuredGroups.length > 0;

    let proxyConfiguration;
    if (proxyConfigurationInput && hasCustomProxyUrls) {
        proxyConfiguration = await Actor.createProxyConfiguration(proxyConfigurationInput);
    } else if (proxyConfigurationInput && requestedApifyProxy && isApifyCloud) {
        proxyConfiguration = await Actor.createProxyConfiguration(proxyConfigurationInput);
    } else if (requestedApifyProxy && !isApifyCloud) {
        log.info('Local run detected: ignoring Apify Proxy settings.');
    }

    const usesUnblocker = configuredGroups.includes('UNBLOCKER');
    const usesResidential = configuredGroups.includes('RESIDENTIAL');
    const residentialSessionId = usesResidential && !usesUnblocker
        ? `zoot_${Date.now()}`
        : undefined;
    const browserProxyUrl = proxyConfiguration
        ? await proxyConfiguration.newUrl(residentialSessionId)
        : undefined;
    const browserProxy = buildBrowserProxyOptions(browserProxyUrl);
    let browserSession = await createBrowserSession(browserProxy);
    let { page } = browserSession;

    const seenProductKeys = new Set();
    let savedCount = 0;

    log.info('Starting ZOOT.cz extraction', {
        inputMode,
        resultsWanted,
        maxPages,
        proxyEnabled: Boolean(proxyConfiguration),
    });

    try {
        for (let pageNumber = 1; pageNumber <= maxPages && savedCount < resultsWanted; pageNumber++) {
        log.info(`Fetching listing page ${pageNumber}`);

        let html;
        try {
            const pageUrl = buildPageUrl(startUrl, pageNumber);
            try {
                html = await fetchHtml(page, pageUrl);
            } catch (error) {
                if (!isBrowserCrashError(error)) throw error;

                log.warning(`Browser target crashed on page ${pageNumber}; restarting the browser once.`);
                await closeBrowserSession(browserSession);
                browserSession = await createBrowserSession(browserProxy);
                page = browserSession.page;
                html = await fetchHtml(page, pageUrl);
            }
        } catch (error) {
            log.error(`Listing request failed on page ${pageNumber}: ${error.message}`);
            break;
        }

        let dataLayer;
        try {
            dataLayer = extractJsonAssignment(html, 'dataLayer');
        } catch (error) {
            log.error(`Listing payload parsing failed on page ${pageNumber}: ${error.message}`);
            break;
        }

        if (!Array.isArray(dataLayer)) {
            log.error(`Listing payload on page ${pageNumber} was not an array.`);
            break;
        }

        const listingPayload = dataLayer[0] || {};
        const rawImpressions = listingPayload?.ecommerce?.impressions;
        const impressions = Array.isArray(rawImpressions) ? rawImpressions : [];
        if (rawImpressions !== undefined && !Array.isArray(rawImpressions)) {
            log.warning(`Invalid impressions payload on page ${pageNumber}; expected an array.`);
        }

        const pushDataInfo = extractPushDataInfo(html);
        const productCards = extractProductCards(html);
        const fallbackCategoryPath = Array.isArray(listingPayload.pageCategory) ? listingPayload.pageCategory.join(' / ') : undefined;
        const fallbackCategoryUrl = inputMode === 'url' ? startUrl : undefined;

        if (!impressions.length) {
            log.info(`No impressions found on page ${pageNumber}. Stopping.`);
            break;
        }

        const batch = [];
        for (let index = 0; index < impressions.length && savedCount < resultsWanted; index++) {
            const impression = impressions[index];
            const productKey = String(impression?.id || impression?.zootId || impression?.ident || '');

            if (!productKey || seenProductKeys.has(productKey)) continue;
            seenProductKeys.add(productKey);

            let record;
            try {
                record = buildRecord({
                    impression,
                    listingInfo: pushDataInfo[productKey],
                    card: productCards.get(productKey),
                    pageNumber,
                    fallbackCategoryPath,
                    fallbackCategoryUrl,
                    searchKeyword: inputMode === 'keyword' ? keyword : undefined,
                });
            } catch (error) {
                log.warning(`Skipping product with an invalid payload on page ${pageNumber}`, {
                    reason: error.message,
                });
                continue;
            }

            if (!record.product_id || !record.name || !record.url) {
                log.warning(`Skipping incomplete product record on page ${pageNumber}`, {
                    position: impression?.position || index + 1,
                    hasProductId: Boolean(record.product_id),
                    hasName: Boolean(record.name),
                    hasUrl: Boolean(record.url),
                });
                continue;
            }

            batch.push(record);
            savedCount++;
        }

        if (!batch.length) {
            log.info(`No new items saved from page ${pageNumber}.`);
            continue;
        }

        await Dataset.pushData(batch);
        log.info(`Saved ${batch.length} items from page ${pageNumber}`, {
            totalSaved: savedCount,
            resultsWanted,
        });

        if (impressions.length < 48) {
            log.info('Reached the last listing page.');
            break;
        }
        }

        log.info(`Extraction complete. Saved ${savedCount} products.`);
    } finally {
        await closeBrowserSession(browserSession);
    }
}

try {
    await main();
} finally {
    await Actor.exit();
}
