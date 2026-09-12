# API Discovery

## Selected API
- Endpoint: `https://www.zoot.cz/vyhledavani/hledani:{keyword}/` and any ZOOT listing URL such as category, brand, tag, or filtered paths
- Method: `GET`
- Auth: None
- Pagination: `/strana:{page}/`
- Fields available:
  - Listing payload: `pageType`, `productInCategory`, `ecommerce.impressions[].id`, `ident`, `ean`, `zootId`, `brandId`, `variant`, `metric1`, `position`
  - Listing card payload: `pushDataInfo[*].ident`, `list`, `pos`, `variant`, `name`, `price`, `priceVAT`, `brand`, `category`, plus listing-card URLs, images, visible sizes, and visible original price blocks
- Fields currently missing in the original actor and now added:
  - `product_group`
  - `brand`
  - `category_path`
  - `category_url`
  - `sizes_available`
  - `sizes_available_text`
  - `colors_available`
  - `colors_available_text`
  - `stock_label`
  - `current_price_czk`
  - `sale_price_czk`
  - `full_price_czk`
  - `discount_amount_czk`
  - `discount_percent`
  - `lowest_30d_price_czk`
  - `images`
- Field count: 25+ structured fields versus roughly 10 in the earlier listing-only implementation

## Selection Notes

The strongest live source is the server-rendered `dataLayer` payload plus the `pushDataInfo` object and product-card HTML embedded directly in ZOOT.cz listing pages. It is not a standalone `/api/` endpoint, but it is structured data available without authentication, present in plain HTTP responses, and replayable without a browser.

## Candidate Scoring

| Candidate | Returns JSON directly | >15 fields | No auth | Pagination | Extends current fields | Score |
|---|---:|---:|---:|---:|---:|---:|
| Embedded `dataLayer` + `pushDataInfo` on listing pages | 0 | 25 | 20 | 15 | 10 | 70 |
| Luigi's Box assets | 0 | 0 | 20 | 0 | 0 | 20 |
| Anonymous URLScan result JSON | 0 | 0 | 0 | 0 | 0 | 0 |

The selected source exceeds the minimum score of 50 because it provides a large structured payload, works over plain HTTP requests, supports pagination, and substantially increases field coverage.

## Discovery Steps Followed

1. Audited the existing actor files and documented the current field set.
2. Queried URLScan search for `domain:zoot.cz`.
3. Confirmed public scan metadata exists, but anonymous access to full result payloads is blocked with `{"warning":"You're not logged in!"}`.
4. Inspected the live search page HTML in parallel for:
   - `dataLayer`
   - `application/ld+json`
   - `_next/data`
   - `/api/` and `/graphql` patterns
5. Confirmed the listing page embeds a large `dataLayer` array with `ecommerce.impressions`.
6. Verified listing cards expose detail URLs, images, visible size options, and visible original-price blocks, removing the need for per-product detail requests.

## Weaker Candidates Rejected

- `api.luigisbox.tech` assets were referenced indirectly, but no stable unauthenticated product listing endpoint was exposed in the fetched HTML.
- `application/ld+json` did not provide a richer listing payload than `dataLayer`.
- `_next/data` and `/graphql` endpoints were not present in the live responses.
- Browser automation was not required because the selected payload is available in plain HTML responses.

## Required Headers

- `User-Agent`
- `Accept-Language`

No cookies, tokens, or JavaScript-executed headers were required during live verification.

## HTTP Viability

The actor can stay fully HTTP-based with `gotScraping`. Listing pages alone provide the structured data needed for resilient, high-speed extraction.

## Runtime Revalidation

The original plain-HTTP source was rechecked after ZOOT introduced an Anubis challenge. The challenge returns HTTP 200 and HTML, but it does not contain listing data, so status alone is not treated as a successful extraction.

| Candidate | Request profile | Status/body marker | Required fields | Pagination | Decision |
|---|---|---:|---|---|---|
| Listing HTML | impit Chrome | 200, 7,476 bytes, `/.within.website/`, no `dataLayer` | 0 | Not reached | Rejected as blocked |
| Listing HTML | impit Firefox | 200, 7,429 bytes, `/.within.website/`, no `dataLayer` | 0 | Not reached | Rejected as blocked |
| Listing HTML | iOS Safari headers | 200, 7,494 bytes, `/.within.website/`, no `dataLayer` | 0 | Not reached | Rejected as blocked |
| Listing HTML | Android app-style headers | 200, 7,372 bytes, `/.within.website/`, no `dataLayer` | 0 | Not reached | Rejected as blocked |
| `m.zoot.cz` listing | Direct HTTPS | TLS hostname mismatch | 0 | Unknown | Rejected |
| `mobile.zoot.cz` listing | Direct HTTPS | TLS hostname mismatch | 0 | Unknown | Rejected |
| `/_ajax/store_zobrazeni.php` | Browser-observed XHR | 200, empty body | 0 | Not a listing feed | Rejected |
| Browser-completed listing page | Chrome browser session | `dataLayer`, `pushDataInfo`, 48 product cards | Existing listing fields | `/strana:{page}/` | Selected fallback |

The browser-completed page was the only tested path that returned the required payload markers and product cards. No observed JSON listing endpoint was available to replace the current extraction mapping. The final actor therefore uses a browser fallback only after direct HTTP/API candidates fail, while retaining the existing structured payload parser and pagination behavior.

## Browser Fallback Request Context

- Browser profile: Patchright Chrome persistent context with `channel: 'chrome'`, `headless: false`, and `noViewport: true`.
- Authentication: None observed.
- Challenge handling: allow the page JavaScript to complete the observed Anubis challenge within the browser context.
- Headers: no manually invented browser fingerprint headers.
- Proxy: pass the configured Apify proxy through to the browser when enabled; keep one proxy identity for the browser context.
- Session: one browser context is reused across paginated listing requests so challenge cookies and page state remain available.
- Sensitive values: no cookies, tokens, or response bodies are stored in this discovery document.
