## What does the ZOOT.cz Product Scraper do?

The ZOOT.cz Product Scraper collects structured product data from public ZOOT.cz search, category, and subcategory pages. Provide one ZOOT.cz listing URL or a search keyword, set the number of products and pages you need, and receive a clean dataset for product research, price monitoring, catalog work, and assortment analysis.

Each result can include the product name, brand, product and variant identifiers, EAN, category information, available colors and sizes, stock status, current and original prices, discount details, lowest 30-day price, product images, product URL, and listing position. Empty source fields are left out of the final item instead of being filled with guesses.

The Actor is useful for ecommerce teams, retailers, marketplace researchers, merchandising teams, agencies, and analysts who need current ZOOT.cz catalog data without manually copying product cards into a spreadsheet.

## Why use the ZOOT.cz Product Scraper?

- **Product catalog research** - Collect product names, brands, categories, variants, prices, and images for assortment reviews.
- **Price monitoring** - Compare current prices with full prices, sale prices, discount percentages, and the lowest displayed price from the last 30 days.
- **Variant availability checks** - Track colors, sizes, stock labels, and in-stock status for listed products.
- **Competitor and market analysis** - Build repeatable snapshots of ZOOT.cz search results or selected categories.
- **Clean, deduplicated results** - Repeated listing variants across pages are skipped before they are saved.
- **Apify workflow support** - Download datasets, connect webhooks, schedule repeat runs, or access results through the Apify API.

## What data can you extract from ZOOT.cz?

The Actor captures product identity, catalog context, variant availability, pricing, stock information, images, and direct product links from ZOOT.cz listings.

## Output Data

The Actor returns one dataset item per unique listed product variant when the source provides the required identifying and product link information.

| Field                   | Type    | Description                                                         |
| ----------------------- | ------- | ------------------------------------------------------------------- |
| `product_id`            | String  | ZOOT.cz product or variant identifier.                              |
| `listing_variant_key`   | String  | Listing-level variant key used to identify duplicate records.       |
| `product_group`         | String  | Shared product group identifier when available.                     |
| `ean`                   | String  | EAN barcode when published by the source.                           |
| `name`                  | String  | Product name shown on the listing.                                  |
| `brand`                 | String  | Product brand.                                                      |
| `brand_id`              | String  | Brand identifier when available.                                    |
| `category_path`         | String  | Product category or breadcrumb path.                                |
| `category_url`          | String  | Listing or category URL used for category context.                  |
| `color`                 | String  | Primary color associated with the listed variant.                   |
| `colors_available`      | Array   | Colors exposed for the listing variant.                             |
| `colors_available_text` | String  | Comma-separated color values.                                       |
| `sizes_available`       | Array   | Sizes shown as available on the listing card.                       |
| `sizes_available_text`  | String  | Comma-separated size values.                                        |
| `in_stock`              | Boolean | Whether the source marks the variant as in stock.                   |
| `stock_label`           | String  | Availability label shown by ZOOT.cz.                                |
| `currency`              | String  | Currency code for the price fields, normally `CZK`.                 |
| `current_price_czk`     | Number  | Current public price in Czech koruna.                               |
| `sale_price_czk`        | Number  | Sale price when separately available.                               |
| `full_price_czk`        | Number  | Original or full price when shown.                                  |
| `discount_amount_czk`   | Number  | Difference between the full and current prices.                     |
| `discount_percent`      | Number  | Calculated discount percentage when both prices are available.      |
| `lowest_30d_price_czk`  | Number  | Lowest price displayed for the previous 30 days when available.     |
| `image`                 | String  | Primary product image URL.                                          |
| `images`                | Array   | Product image URLs found on the listing.                            |
| `url`                   | String  | Direct ZOOT.cz product URL.                                         |
| `listing_position`      | Integer | Product position on its listing page.                               |
| `listing_page`          | Integer | Listing page where the item was found.                              |
| `search_keyword`        | String  | Search keyword for keyword-based runs. Omitted for direct URL runs. |
| `source`                | String  | Source website identifier, `zoot.cz`.                               |

Some fields are optional because ZOOT.cz does not publish the same information for every product or variant.

## How to use the ZOOT.cz Product Scraper

1. Open the Actor in Apify Console.
2. Choose one search mode: enter a complete ZOOT.cz listing URL or enter a keyword.
3. Set `results_wanted` to the maximum number of products to save.
4. Set `max_pages` if you want to limit how many listing pages are checked.
5. Optionally configure Apify Proxy for repeated or larger runs.
6. Start the run and open the default dataset when it finishes.
7. Download the results or connect the dataset to another workflow.

Use either `url` or `keyword` for a clear search mode. If both are supplied, the URL takes priority and the keyword is not added to the search request or result metadata.

## Input Parameters

| Parameter            | Type    | Required | Default        | Description                                                                                        |
| -------------------- | ------- | -------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `url`                | String  | No       | None           | Complete ZOOT.cz search, category, or subcategory URL. Takes priority over `keyword`.              |
| `keyword`            | String  | No       | None           | Search phrase used when `url` is not supplied.                                                     |
| `results_wanted`     | Integer | No       | `20`           | Maximum number of products to save. Must be greater than zero.                                     |
| `max_pages`          | Integer | No       | `20`           | Maximum number of listing pages to visit. ZOOT.cz listing pages commonly expose up to 48 products. |
| `proxyConfiguration` | Object  | No       | Proxy disabled | Optional Apify Proxy settings for repeated or larger collection jobs.                              |

At least one usable value must be provided in `url` or `keyword`. Use full public ZOOT.cz URLs, including the `https://` scheme.

## Usage Examples

### Search by keyword

Use a keyword when you want the Actor to build a ZOOT.cz search URL for you.

```json
{
    "keyword": "shirt",
    "results_wanted": 20,
    "max_pages": 1
}
```

### Collect a specific listing URL

Use a direct URL for a search page, category, or subcategory. This is useful when you want to repeat the same catalog snapshot.

```json
{
    "url": "https://www.zoot.cz/vyhledavani/hledani:shirt/",
    "results_wanted": 50,
    "max_pages": 2
}
```

### Run a larger collection with Apify Proxy

Enable proxy settings when collecting repeatedly or requesting more pages. Keep the result and page limits appropriate for the size of the listing.

```json
{
    "url": "https://www.zoot.cz/damske/",
    "results_wanted": 200,
    "max_pages": 5,
    "proxyConfiguration": {
        "useApifyProxy": true
    }
}
```

Do not combine a prefilled example with another search mode. For example, a keyword run should contain `keyword` without an unrelated `url`, and a URL run should contain `url` without an unrelated `keyword`.

## Sample Output

The following example shows one realistic dataset item. Optional fields may be absent when ZOOT.cz does not publish them for a particular product.

```json
{
    "product_id": "598799",
    "listing_variant_key": "598799XXBéžová|||Béžová",
    "product_group": "598799",
    "ean": "1200150331330",
    "name": "Svrchní kostkovaná košile Oxford Shirt GAP",
    "brand": "GAP",
    "brand_id": "275",
    "category_path": "Oblečení / Košile / Košile dlouhý rukáv",
    "category_url": "https://www.zoot.cz/panske/",
    "color": "Béžová",
    "colors_available": ["Béžová"],
    "colors_available_text": "Béžová",
    "sizes_available": ["XS", "S", "M", "L", "XL", "XXL"],
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
        "https://d010202.zoot.cz/_galerie/varianty/373/3734185-d.jpg",
        "https://d010202.zoot.cz/_galerie/varianty/373/3734186-d.jpg"
    ],
    "url": "https://www.zoot.cz/panske/detail-vyrobku/598799-gap-svchni-kostkovana-kosile-oxford-shirt-gap/vse/20406:bezova-bezova/",
    "listing_position": 1,
    "listing_page": 1,
    "search_keyword": "shirt",
    "source": "zoot.cz"
}
```

## Tips for best results

- **Start with a small run** - Use `results_wanted: 20` and `max_pages: 1` while checking a new URL or keyword.
- **Choose one search mode** - Use a direct URL for a repeatable category snapshot and a keyword for a quick search.
- **Use public listing URLs** - Confirm that the URL opens a ZOOT.cz search, category, or subcategory page before running it.
- **Set limits together** - A high `results_wanted` value may require more pages, while a low `max_pages` value can stop collection early.
- **Review optional fields** - Missing EANs, sizes, images, or price values usually reflect what the source publishes for that listing.
- **Use proxy settings for repeat jobs** - Apify Proxy can help with larger or frequently repeated collections.
- **Schedule catalog snapshots** - Run the Actor on a schedule when you need regular price, stock, or assortment comparisons.
- **Check the dataset preview** - Review the first results before increasing limits or scheduling recurring runs.

## Exports and Integrations

Apify datasets can be used directly in the Console or connected to downstream tools.

- **JSON** - Use the structured dataset in applications, scripts, and data pipelines.
- **CSV** - Open product, price, and stock data in spreadsheet software.
- **Excel** - Share catalog and pricing reports with merchandising or purchasing teams.
- **XML** - Send structured records to systems that require XML exchange.
- **Google Sheets** - Review product and price snapshots in a shared spreadsheet.
- **Webhooks** - Trigger a workflow after a run completes.
- **Make and Zapier** - Route product records into no-code automations.
- **Apify API** - Read dataset items programmatically or connect scheduled runs to internal services.

## Frequently Asked Questions

### Can I scrape a ZOOT.cz category page instead of a keyword search?

Yes. Put the complete category or subcategory URL in `url`. The Actor visits that listing and its pagination until it reaches your limits or the source has no more products.

### Can I use both `url` and `keyword`?

You can provide both, but the URL takes priority. For predictable runs, submit only the field that matches your intended search mode.

### How many products can I collect?

The maximum is controlled by `results_wanted` and `max_pages`. The Actor stops when it reaches either limit, when there are no more listing results, or when additional pages contain no new products.

### Why did the dataset contain fewer products than requested?

The selected listing may have fewer products than the requested limit. Duplicate variants are removed, and incomplete records without a product identifier, name, or product URL are skipped. Temporary access restrictions can also prevent a page from returning product data.

### Can I monitor ZOOT.cz prices over time?

Yes. Schedule recurring runs and compare `current_price_czk`, `sale_price_czk`, `full_price_czk`, `discount_percent`, and `lowest_30d_price_czk` between dataset snapshots.

### Are all product fields present for every item?

No. The output reflects the information published for each listing. EAN, stock labels, sizes, colors, images, and price fields may be missing for some products.

### Can I use this Actor without writing code?

Yes. Apify Console provides form-based inputs, dataset previews, downloads, schedules, and integrations. Developers can also start runs and retrieve datasets through the Apify API.

### What should I do if a run returns no products?

First verify that the URL or keyword identifies a public listing with matching products. Try a smaller run, check the run log for access or source-page warnings, and enable Apify Proxy for repeated or larger jobs. If the issue continues with a working public listing, report it through the Actor page.

### Can I run the Actor on a schedule?

Yes. Create an Apify schedule and choose an interval such as hourly, daily, or weekly. Scheduled snapshots are useful for price, stock, and assortment monitoring.

### Is it legal to collect ZOOT.cz product data?

The Actor is intended for legitimate collection of publicly available product information. You are responsible for following ZOOT.cz terms, applicable laws, intellectual property requirements, and any restrictions on storing or redistributing the collected data.

## Related Actors

These related Actors are verified public Actors published under the Shahid Irfan Apify profile. They focus on job and hiring data, making them useful for teams that also collect employment-market information alongside ecommerce research.

- [Learn4Good Job Scraper](https://apify.com/shahidirfan/Learn4Good-Job-Scraper) - Collect worldwide job postings, teaching roles, and career listings from Learn4Good.
- [Fast LinkedIn Job Scraper](https://apify.com/shahidirfan/Fast-LinkedIn-job-Scraper) - Collect structured LinkedIn job listings for recruitment research and hiring analysis.
- [Reed Job Scraper](https://apify.com/shahidirfan/Reed-Job-Scraper) - Collect Reed.co.uk job listings with titles, companies, locations, salaries, and descriptions.
- [SimplyHired Job Scraper](https://apify.com/shahidirfan/Simplyhired-Job-Scraper) - Collect SimplyHired job listings for recruiting, salary research, and job-market analysis.

## Support

For bugs, input questions, or feature requests, use the Issues tab on the Actor page or contact the developer through Apify. Include the input mode, the public URL or a description of the search, the run ID, and the relevant log message. Do not include private credentials or proxy details in a support request.

## Legal Notice

This Actor is designed for legitimate product research, catalog analysis, price monitoring, and other responsible uses of publicly available ZOOT.cz information. Users are responsible for complying with website terms, applicable laws, intellectual property rights, and data-handling obligations.
