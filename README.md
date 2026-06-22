# ZOOT.cz Product Scraper

Collect detailed ZOOT.cz product data from search, category, and subcategory pages. Build clean datasets with pricing, stock status, variant data, category metadata, and image coverage for research, merchandising, and catalog monitoring.

## Features

- **Structured product coverage** — Collect product IDs, variant IDs, EANs, brand data, category data, pricing, stock labels, and media links.
- **Search and category support** — Start from a direct ZOOT.cz URL or build a search from a keyword.
- **Variant-aware output** — Preserve color and size availability for each listed product variant.
- **Deduplicated results** — Skip repeated records across pages by tracking the listing variant key.
- **Clean datasets** — Remove empty fields and skip incomplete records before they reach the dataset.

## Use Cases

### Catalog Monitoring
Track which products are currently listed, how they are categorized, and which variants remain available. This is useful for merchandising teams that need regular catalog snapshots.

### Pricing Analysis
Compare current price, sale price, full price, and discount values across listings. This helps with promotion monitoring and competitor benchmarking.

### Assortment Research
Capture brand, category, color, and size availability in one dataset. This supports assortment planning and product-mix analysis.

### Image and Content Operations
Export product and gallery image URLs for downstream content workflows. This is useful when building internal catalogs or QA reports.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | String | No | `"https://www.zoot.cz/vyhledavani/hledani:shirt/"` | Full ZOOT.cz search or category URL. If provided, it takes priority over `keyword`. |
| `keyword` | String | No | `"shirt"` | Search term used when `url` is not provided. |
| `results_wanted` | Integer | No | `20` | Maximum number of products to save. |
| `max_pages` | Integer | No | `20` | Maximum number of listing pages to visit. |
| `proxyConfiguration` | Object | No | — | Optional Apify proxy settings for more resilient collection. |

---

## Output Data

Each dataset item contains:

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | String | ZOOT.cz product identifier. |
| `variant_id` | String | Variant identifier from the product page. |
| `listing_variant_key` | String | Listing-level key used for deduplication. |
| `product_group` | String | Shared group identifier across variants. |
| `ean` | String | Product barcode when available. |
| `name` | String | Product name. |
| `brand` | String | Brand name. |
| `brand_id` | String | Brand identifier. |
| `category_path` | String | Category breadcrumb path. |
| `category_id` | String | Category identifier. |
| `category_url` | String | Category landing page URL. |
| `color` | String | Primary color for the saved variant. |
| `colors_available` | Array | Distinct color values exposed for the listing item. |
| `colors_available_text` | String | Flat comma-separated color list. |
| `sizes_available` | Array | Sizes exposed directly on the listing card. |
| `sizes_available_text` | String | Flat comma-separated size list. |
| `in_stock` | Boolean | Whether the variant is currently in stock. |
| `stock_label` | String | Availability label from the source page. |
| `currency` | String | Currency code used for price fields. |
| `current_price_czk` | Number | Current public price in CZK. |
| `sale_price_czk` | Number | Sale price in CZK when available. |
| `full_price_czk` | Number | Full price in CZK before discount. |
| `discount_amount_czk` | Number | Difference between full price and current price. |
| `discount_percent` | Number | Percentage discount when available. |
| `lowest_30d_price_czk` | Number | Lowest listed price over the last 30 days when shown on the card. |
| `image` | String | Primary image URL. |
| `images` | Array | Additional gallery image URLs. |
| `url` | String | Product URL. |
| `listing_position` | Integer | Position on the listing page. |
| `listing_page` | Integer | Listing page number where the product was found. |
| `search_keyword` | String | Keyword used for the run when applicable. |
| `source` | String | Source marketplace identifier. |

---

## Usage Examples

### Basic Search

Collect the first 20 results for a keyword:

```json
{
    "keyword": "shirt",
    "results_wanted": 20
}
```

### Direct Listing URL

Start from a specific listing page:

```json
{
    "url": "https://www.zoot.cz/vyhledavani/hledani:shirt/",
    "results_wanted": 30,
    "max_pages": 3
}
```

### Proxy-Assisted Run

Use a proxy configuration for more resilient collection:

```json
{
    "keyword": "shirt",
    "results_wanted": 20,
    "proxyConfiguration": {
        "useApifyProxy": true
    }
}
```

---

## Sample Output

```json
{
    "product_id": "5045959",
    "variant_id": "3024867",
    "listing_variant_key": "598799XXBéžová|||Béžová",
    "product_group": "598799",
    "ean": "1200150331330",
    "name": "Svrchní kostkovaná košile Oxford Shirt GAP",
    "brand": "GAP",
    "brand_id": "275",
    "category_path": "Oblečení / Košile / Košile dlouhý rukáv",
    "category_id": "10",
    "category_url": "https://www.zoot.cz/panske/",
    "color": "Béžová",
    "colors_available": [
        "Béžová"
    ],
    "sizes_available": [
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "XXL"
    ],
    "sizes_available_text": "XS, S, M, L, XL, XXL",
    "in_stock": true,
    "stock_label": "Skladem",
    "currency": "CZK",
    "current_price_czk": 979,
    "sale_price_czk": 809.09,
    "full_price_czk": 1399,
    "discount_amount_czk": 420,
    "discount_percent": 30,
    "lowest_30d_price_czk": 778,
    "image": "https://d010202.zoot.cz/_galerie/varianty/373/3734185-d.jpg",
    "images": [
        "https://d010202.zoot.cz/_galerie/varianty/373/3734186-d.jpg",
        "https://d010202.zoot.cz/_galerie/varianty/373/3734187-d.jpg"
    ],
    "url": "https://www.zoot.cz/panske/detail-vyrobku/598799-gap-svchni-kostkovana-kosile-oxford-shirt-gap/vse/20406:bezova-bezova/",
    "listing_position": 1,
    "listing_page": 1,
    "search_keyword": "shirt",
    "source": "zoot.cz"
}
```

---

## Tips for Best Results

### Start Small
- Begin with `results_wanted: 20` to validate the output quickly.
- Increase the limit after confirming the listing you want is returning the right products.

### Prefer Stable Listing URLs
- Use a direct listing URL when you already know the exact category or search page you want.
- Keep `max_pages` low during testing to reduce unnecessary requests.

### Use Proxies When Needed
- Enable Apify Proxy if you expect repeated runs or larger result sets.
- Residential proxy groups can help if the source becomes less tolerant of repeated requests.

---

## Integrations

Connect your data with:

- **Google Sheets** — Export pricing and assortment data for quick review.
- **Airtable** — Build searchable product databases for internal teams.
- **Make** — Route updated product datasets into automated workflows.
- **Zapier** — Trigger actions when new products or pricing changes appear.
- **Webhooks** — Send each run into your own systems for downstream processing.

### Export Formats

- **JSON** — For downstream apps and APIs.
- **CSV** — For spreadsheet work and reporting.
- **Excel** — For business review and stakeholder sharing.
- **XML** — For systems that require structured exchange formats.

---

## Frequently Asked Questions

### Can I scrape category pages instead of search results?
Yes. Provide the full category or subcategory URL in `url` and the actor will start from that page.

### How many products can I collect?
You can collect as many products as the listing exposes, subject to your `results_wanted` and `max_pages` limits.

### Why are some fields missing from certain products?
Some products simply do not expose every field on the source page. Empty values are removed from the final dataset to keep the output clean.

### Does the actor remove duplicates?
Yes. Repeated listing variants are skipped before data is pushed to the dataset.

### Can I use this for price monitoring?
Yes. The output includes current, sale, and full price fields when they are available, along with computed discount values.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with website terms of service and applicable laws. Use collected data responsibly and respect the source website.
