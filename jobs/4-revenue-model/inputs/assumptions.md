# Revenue model assumptions

Fictional data for the Desk Test. Ledgerline is a subscription bookkeeping app with three plans, listed in pricing.csv.

## How the model works

- Model 36 months, month by month. Month 1 is January 2027. Year 1 is months 1 to 12, year 2 is months 13 to 24, year 3 is months 25 to 36.
- Do every calculation separately for each plan.
- New customers grow 2% per month, compounding. New customers in month m = `new_customers_month_1` × 1.02^(m − 1).
- Each month, customers lost = opening customers × `monthly_churn`.
- Closing customers = opening customers − customers lost + new customers.
- Opening customers in month 1 = `starting_customers`. Opening customers in any later month = closing customers of the month before.
- Keep fractional customers. Do not round anywhere.
- Prices rise 5% at the start of year 2 and again at the start of year 3: the monthly price in year y = `price_per_month_usd` × 1.05^(y − 1).
- Revenue for a plan in a month = closing customers × that month's price.
- Total revenue for a year = the revenue of all three plans over that year's 12 months.

## Workbook layout

The workbook must have these three sheets.

**Inputs**: one input per row, the label in column A and the value in column B. Use exactly these labels:

| Label | Value |
| --- | --- |
| Starter price | 29 |
| Team price | 99 |
| Business price | 299 |
| Starter starting customers | 1200 |
| Team starting customers | 420 |
| Business starting customers | 85 |
| Starter new customers month 1 | 140 |
| Team new customers month 1 | 45 |
| Business new customers month 1 | 8 |
| Starter monthly churn | 0.035 |
| Team monthly churn | 0.02 |
| Business monthly churn | 0.012 |
| New customer monthly growth | 0.02 |
| Annual price increase | 0.05 |

**Model**: the month-by-month calculation, laid out however you like. Every number must be a formula that refers back to the Inputs sheet, directly or through other formulas.

**Summary**: row 1 holds the headers Year 1, Year 2 and Year 3 in columns B, C and D. Below it, a row labelled `Total revenue` in column A with each year's total revenue in columns B, C and D, calculated by formulas.
