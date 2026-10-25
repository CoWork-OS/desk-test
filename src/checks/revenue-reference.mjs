// The reference answer for job 4, computed exactly as jobs/4-revenue-model/inputs/assumptions.md
// describes. The check compares the workbook's own formulas against this, before and after
// changing inputs.

export const PLANS = ["Starter", "Team", "Business"];

export const BASE_INPUTS = {
  "Starter price": 29,
  "Team price": 99,
  "Business price": 299,
  "Starter starting customers": 1200,
  "Team starting customers": 420,
  "Business starting customers": 85,
  "Starter new customers month 1": 140,
  "Team new customers month 1": 45,
  "Business new customers month 1": 8,
  "Starter monthly churn": 0.035,
  "Team monthly churn": 0.02,
  "Business monthly churn": 0.012,
  "New customer monthly growth": 0.02,
  "Annual price increase": 0.05,
};

/**
 * The inputs the check changes to prove the workbook recalculates. Chosen so every year's
 * total moves by more than the 1% tolerance (years 1-3: +4.7%, +12.3%, +29.8%).
 */
export const PERTURBATION = {
  "Business price": 399,
  "Team monthly churn": 0.06,
  "New customer monthly growth": 0.04,
};

/** Total revenue for years 1 to 3. */
export function referenceYearTotals(inputs = BASE_INPUTS) {
  const totals = [0, 0, 0];
  for (const plan of PLANS) {
    let customers = inputs[`${plan} starting customers`];
    for (let month = 1; month <= 36; month += 1) {
      const year = Math.ceil(month / 12);
      const newCustomers =
        inputs[`${plan} new customers month 1`] * (1 + inputs["New customer monthly growth"]) ** (month - 1);
      customers = customers - customers * inputs[`${plan} monthly churn`] + newCustomers;
      const price = inputs[`${plan} price`] * (1 + inputs["Annual price increase"]) ** (year - 1);
      totals[year - 1] += customers * price;
    }
  }
  return totals;
}
