import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

const BASE_URL = 'https://www.zoot.cz';
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_HEADERS = {
    'accept-language': 'en-US,en;q=0.9,cs;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

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

function buildStartUrl({ url, keyword }) {
    if (url) return normalizeStartUrl(url);
    if (keyword) return `${BASE_URL}/vyhledavani/hledani:${buildKeywordPath(keyword)}/`;
    throw new Error('Missing required input: provide either "url" or "keyword".');
}

function buildPageUrl(startUrl, pageNumber) {
    return pageNumber === 1 ? startUrl : `${startUrl}strana:${pageNumber}/`;
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

async function fetchHtml(url, proxyConfiguration) {
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
    const response = await gotScraping({
        url,
        proxyUrl,
        headers: DEFAULT_HEADERS,
        timeout: {
            request: REQUEST_TIMEOUT_MS,
        },
        retry: {
            limit: 2,
        },
    });

    return response.body;
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

    const {
        url = '',
        keyword = '',
        results_wanted,
        max_pages,
        proxyConfiguration: proxyConfigurationInput,
    } = input;

    const resultsWanted = toPositiveInteger(results_wanted, DEFAULT_RESULTS_WANTED);
    const maxPages = toPositiveInteger(max_pages, DEFAULT_MAX_PAGES);
    const startUrl = buildStartUrl({ url, keyword });
    const proxyConfiguration = proxyConfigurationInput
        ? await Actor.createProxyConfiguration(proxyConfigurationInput)
        : undefined;

    const seenProductKeys = new Set();
    let savedCount = 0;

    log.info('Starting ZOOT.cz extraction', {
        inputMode: url ? 'url' : 'keyword',
        resultsWanted,
        maxPages,
        proxyEnabled: Boolean(proxyConfiguration),
    });

    for (let pageNumber = 1; pageNumber <= maxPages && savedCount < resultsWanted; pageNumber++) {
        log.info(`Fetching listing page ${pageNumber}`);

        let html;
        try {
            html = await fetchHtml(buildPageUrl(startUrl, pageNumber), proxyConfiguration);
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

        const listingPayload = dataLayer?.[0] || {};
        const impressions = listingPayload?.ecommerce?.impressions || [];
        const pushDataInfo = extractPushDataInfo(html);
        const productCards = extractProductCards(html);
        const fallbackCategoryPath = Array.isArray(listingPayload.pageCategory) ? listingPayload.pageCategory.join(' / ') : undefined;
        const fallbackCategoryUrl = !keyword ? startUrl : undefined;

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

            const record = buildRecord({
                impression,
                listingInfo: pushDataInfo[productKey],
                card: productCards.get(productKey),
                pageNumber,
                fallbackCategoryPath,
                fallbackCategoryUrl,
                searchKeyword: keyword,
            });

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
}

try {
    await main();
} finally {
    await Actor.exit();
}
