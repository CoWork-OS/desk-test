// Job 2 source: one services agreement, two drafts. A clause with `v2` text differs in draft 2;
// `change` describes that difference for the answer key. Every other clause is identical in both.

export const TITLE = "Master Services Agreement";
export const PARTIES =
  "This agreement is between Pellucid Analytics Ltd. (\"Provider\") and Brightwater Clinics Group (\"Customer\"). Both companies are fictional; this document is test data for the Desk Test.";

export const SECTIONS = [
  {
    heading: "1. Definitions",
    clauses: [
      { num: "1.1", v1: "\"Services\" means the analytics platform and support described in Schedule A." },
      { num: "1.2", v1: "\"Customer Data\" means all data that Customer or its users submit to the Services." },
      { num: "1.3", v1: "\"Effective Date\" means the date on which both parties have signed this Agreement." },
    ],
  },
  {
    heading: "2. Term and renewal",
    clauses: [
      {
        num: "2.1",
        v1: "This Agreement starts on the Effective Date and continues for an initial term of 24 months.",
        v2: "This Agreement starts on the Effective Date and continues for an initial term of 36 months.",
        change: { id: 1, summary: "Initial term 24 months to 36 months", risk: "Medium", old: ["24 months", "24-month", "24"], new: ["36 months", "36-month", "36"], keywords: ["initial term"] },
      },
      { num: "2.2", v1: "After the initial term, this Agreement renews automatically for successive renewal terms of 12 months each." },
      {
        num: "2.3",
        v1: "Either party may prevent automatic renewal by giving written notice at least 90 days before the end of the current term.",
        v2: "Either party may prevent automatic renewal by giving written notice at least 30 days before the end of the current term.",
        change: { id: 2, summary: "Notice to stop auto-renewal 90 days to 30 days", risk: "High", old: ["90 days", "90-day", "90"], new: ["30 days", "30-day", "30"], keywords: ["renewal", "renew"] },
      },
    ],
  },
  {
    heading: "3. Services",
    clauses: [
      { num: "3.1", v1: "Provider will provide the Services in accordance with this Agreement and the documentation." },
      { num: "3.2", v1: "Provider will provide support by email and telephone between 08:00 and 18:00 on business days." },
    ],
  },
  {
    heading: "4. Fees and payment",
    clauses: [
      { num: "4.1", v1: "Customer will pay the fees set out in Schedule B." },
      {
        num: "4.2",
        v1: "Provider will invoice monthly in advance, and Customer will pay each undisputed invoice within 45 days of receipt.",
        v2: "Provider will invoice monthly in advance, and Customer will pay each undisputed invoice within 30 days of receipt.",
        change: { id: 3, summary: "Payment terms 45 days to 30 days", risk: "Medium", old: ["45 days", "45-day", "45"], new: ["30 days", "30-day", "30"], keywords: ["payment", "invoice"] },
      },
      { num: "4.3", v1: "Customer may dispute an invoice in good faith by notifying Provider within 15 days of receipt." },
      {
        num: "4.4",
        v1: "Overdue amounts bear interest at 1.0% per month from the due date until paid.",
        v2: "Overdue amounts bear interest at 1.5% per month from the due date until paid.",
        change: { id: 4, summary: "Late-payment interest 1.0% to 1.5% per month", risk: "Low", old: ["1.0%", "1%"], new: ["1.5%"], keywords: ["interest", "overdue", "late"] },
      },
      { num: "4.5", v1: "All fees are exclusive of VAT and other applicable taxes." },
      {
        num: "4.6",
        v1: "Provider may increase the fees once per contract year by giving Customer at least 90 days' written notice, and any increase will not exceed 3% of the fees for the previous year.",
        v2: "Provider may increase the fees by giving Customer at least 30 days' written notice.",
        change: { id: 5, summary: "Fee increases: 90 days' notice and 3% yearly cap replaced by 30 days' notice and no cap", risk: "High", old: ["90 days", "3%", "once per contract year"], new: ["30 days", "no cap", "uncapped", "removed", "no limit", "no longer capped"], keywords: ["increase", "price", "fee"] },
      },
    ],
  },
  {
    heading: "5. Customer responsibilities",
    clauses: [
      { num: "5.1", v1: "Customer will keep its user accounts and passwords secure and will promptly tell Provider about any unauthorised use." },
      { num: "5.2", v1: "Customer will use the Services in line with Provider's acceptable use policy." },
    ],
  },
  {
    heading: "6. Service levels",
    clauses: [
      {
        num: "6.1",
        v1: "Provider will make the Services available 99.9% of the time in each calendar month, excluding scheduled maintenance.",
        v2: "Provider will make the Services available 99.5% of the time in each calendar month, excluding scheduled maintenance.",
        change: { id: 6, summary: "Availability 99.9% to 99.5%", risk: "Medium", old: ["99.9%", "99.9"], new: ["99.5%", "99.5"], keywords: ["availability", "uptime", "service level"] },
      },
      { num: "6.2", v1: "Provider will announce scheduled maintenance at least 5 business days in advance." },
      {
        num: "6.3",
        v1: "If availability falls below the service level in a month, Customer is entitled to a service credit of 10% of the monthly fee for that month.",
        v2: "If availability falls below the service level in a month, Customer is entitled to a service credit of 5% of the monthly fee for that month.",
        change: { id: 7, summary: "Service credit 10% to 5% of the monthly fee", risk: "Medium", old: ["10%"], new: ["5%"], keywords: ["service credit", "credit"] },
      },
    ],
  },
  {
    heading: "7. Confidentiality",
    clauses: [
      { num: "7.1", v1: "Each party will keep the other party's confidential information confidential and use it only for the purposes of this Agreement." },
      { num: "7.2", v1: "These confidentiality obligations continue for 5 years after this Agreement ends." },
    ],
  },
  {
    heading: "8. Data protection",
    clauses: [
      { num: "8.1", v1: "Provider will process Customer Data only on Customer's documented instructions." },
      {
        num: "8.2",
        v1: "After this Agreement ends, Provider will make Customer Data available for export for 60 days and will then delete it.",
        v2: "After this Agreement ends, Provider will make Customer Data available for export for 15 days and will then delete it.",
        change: { id: 8, summary: "Data export window after termination 60 days to 15 days", risk: "High", old: ["60 days", "60-day", "60"], new: ["15 days", "15-day", "15"], keywords: ["export", "delete", "deletion"] },
      },
    ],
  },
  {
    heading: "9. Security and subprocessors",
    clauses: [
      { num: "9.1", v1: "Provider will maintain appropriate technical and organisational security measures." },
      { num: "9.2", v1: "Provider will notify Customer of any personal data breach without undue delay and in any case within 48 hours." },
      {
        num: "9.3",
        v1: "Provider shall notify Customer at least 30 days before engaging any new subprocessor.",
        v2: "Provider may notify Customer at least 30 days before engaging any new subprocessor.",
        change: { id: 9, summary: "Subprocessor notice changes from shall (required) to may (optional)", risk: "High", old: ["shall", "must", "required", "obligation", "mandatory"], new: ["may", "optional", "discretion", "discretionary"], keywords: ["subprocessor", "sub-processor"] },
      },
    ],
  },
  {
    heading: "10. Intellectual property",
    clauses: [
      { num: "10.1", v1: "Provider owns all rights in the Services and the documentation." },
      { num: "10.2", v1: "Customer owns all rights in Customer Data." },
    ],
  },
  {
    heading: "11. Liability",
    clauses: [
      { num: "11.1", v1: "Neither party limits or excludes liability for death or personal injury caused by its negligence, or for fraud." },
      {
        num: "11.2",
        v1: "Subject to clause 11.1, each party's total liability under this Agreement is limited to the fees paid by Customer in the 12 months before the event giving rise to the claim.",
        v2: "Subject to clause 11.1, each party's total liability under this Agreement is limited to the fees paid by Customer in the 6 months before the event giving rise to the claim.",
        change: { id: 10, summary: "Liability cap: fees from the last 12 months to the last 6 months", risk: "High", old: ["12 months", "12-month", "12"], new: ["6 months", "6-month", "six months"], keywords: ["liability", "cap"] },
      },
      { num: "11.3", v1: "Neither party is liable for any indirect or consequential loss." },
    ],
  },
  {
    heading: "12. Termination",
    clauses: [
      { num: "12.1", v1: "Either party may terminate this Agreement if the other party commits a material breach and does not remedy it within 30 days of written notice." },
      { num: "12.2", v1: "Customer may terminate this Agreement for convenience on 90 days' written notice after the initial term." },
    ],
  },
  {
    heading: "13. Governing law",
    clauses: [
      {
        num: "13.1",
        v1: "This Agreement is governed by the laws of England and Wales, and the courts of London have exclusive jurisdiction.",
        v2: "This Agreement is governed by the laws of Ireland, and the courts of Dublin have exclusive jurisdiction.",
        change: { id: 11, summary: "Governing law England and Wales (London courts) to Ireland (Dublin courts)", risk: "Medium", old: ["England", "Wales", "London"], new: ["Ireland", "Dublin", "Irish"], keywords: ["governing law", "jurisdiction"] },
      },
    ],
  },
  {
    heading: "14. General",
    clauses: [
      { num: "14.1", v1: "Notices must be in writing and sent to the addresses set out in Schedule C." },
      { num: "14.2", v1: "This Agreement is the entire agreement between the parties about its subject matter." },
      { num: "14.3", v1: "No change to this Agreement is valid unless it is in writing and signed by both parties." },
      {
        num: "14.4",
        v1: "Neither party may assign or transfer this Agreement without the other party's prior written consent.",
        v2: "Neither party may assign or transfer this Agreement without the other party's prior written consent, except that Provider may assign this Agreement to an affiliate or to a successor to its business without consent.",
        change: { id: 12, summary: "Provider may now assign to an affiliate or successor without consent", risk: "Medium", old: ["consent"], new: ["affiliate", "successor"], keywords: ["assign", "assignment", "transfer"] },
      },
    ],
  },
];

export function clausesFor(version) {
  return SECTIONS.map((section) => ({
    heading: section.heading,
    clauses: section.clauses.map((clause) => ({
      num: clause.num,
      text: version === 2 && clause.v2 ? clause.v2 : clause.v1,
    })),
  }));
}

export function answerKey() {
  return SECTIONS.flatMap((section) =>
    section.clauses
      .filter((clause) => clause.change)
      .map((clause) => ({ section: clause.num, ...clause.change })),
  ).sort((a, b) => a.id - b.id);
}
