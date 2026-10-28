/**
 * Extended labelled benchmark (planted errors + clean controls) across bill types and countries.
 * Every planted error is objectively checkable from the bill itself or well-established rules,
 * so the scoring doesn't depend on a judgement call.
 */
import type { EvalCase } from "./cases";

export const MORE_CASES: EvalCase[] = [
  // ---------------------------------------------------------------- arithmetic-heavy
  {
    id: "urgent-care-math",
    context: "Urgent care visit for a cut finger. Got 3 stitches. In-network, paid nothing yet.",
    text: `QUICKCARE URGENT CARE — Phoenix, AZ 85004
Statement 07/20/2026   Patient: Dana Ruiz   Insurance: UnitedHealthcare (in-network)
DATE      CODE   DESCRIPTION                          QTY  UNIT     AMOUNT
07/11/26  99203  OFFICE VISIT NEW PATIENT LEVEL 3      1   185.00   185.00
07/11/26  12001  SIMPLE REPAIR SUPERFICIAL WOUND       1   240.00   240.00
07/11/26  J1885  KETOROLAC INJECTION                   2    18.00    54.00
07/11/26  A6402  STERILE GAUZE PAD                     4     3.50    14.00
SUBTOTAL                                                       493.00
INSURANCE PAID                                                -210.00
AMOUNT DUE                                                     283.00`,
    planted: [{ label: "ketorolac math (2×18≠54)", match: /KETOROLAC/i, kinds: ["math_error"], amount: 18 }],
    clean: [/OFFICE VISIT/i, /SIMPLE REPAIR/i, /GAUZE/i],
  },
  {
    id: "subtotal-inflated",
    context: "Physical therapy session, self-pay at the quoted rate.",
    text: `MOTION PT CLINIC — Portland, OR 97205
Invoice 2026-0918   Client: Priya Nair   Self-pay
DATE      CODE   DESCRIPTION                          QTY  UNIT     AMOUNT
09/05/26  97110  THERAPEUTIC EXERCISE (15 MIN)         2    45.00    90.00
09/05/26  97140  MANUAL THERAPY (15 MIN)               1    50.00    50.00
09/05/26  97010  HOT/COLD PACK                         1    15.00    15.00
SUBTOTAL                                                       205.00
AMOUNT DUE                                                     205.00`,
    planted: [{ label: "subtotal 205 ≠ lines 155 (+50)", match: /^$/, kinds: ["math_error"], amount: 50 }],
    clean: [/THERAPEUTIC EXERCISE/i, /MANUAL THERAPY/i],
  },
  {
    id: "duplicate-telecom",
    context: "One mobile line, no add-ons ordered. I pay by autopay on time.",
    text: `NORTHWIND MOBILE — Account 5512-0093   Bill date: 2026-09-28
Billing period: 2026-09-01 to 2026-09-30
DESCRIPTION                                 QTY   RATE     AMOUNT (USD)
Unlimited Plus plan                          1    65.00     65.00
Unlimited Plus plan                          1    65.00     65.00
Device installment 14 of 36                  1    27.78     27.78
Regulatory cost recovery fee                 1     3.49      3.49
SUBTOTAL                                                   161.27
Taxes & surcharges                                          11.20
TOTAL DUE                                                  172.47`,
    planted: [{ label: "plan billed twice", match: /Unlimited/i, kinds: ["duplicate"] }],
    clean: [/installment/i],
  },
  {
    id: "total-due-wrong",
    context: "Plumbing repair, invoice agreed upfront. I paid a 100 deposit.",
    text: `FLOWRIGHT PLUMBING — Leeds, UK   Invoice FR-2207   Date: 12 Aug 2026
DESCRIPTION                                 QTY   RATE      AMOUNT (GBP)
Call-out charge                              1    60.00      60.00
Labour (hours)                               2    55.00     110.00
Replacement valve                            1    38.00      38.00
SUBTOTAL                                                    208.00
VAT 20%                                                      41.60
DEPOSIT PAID                                                -100.00
BALANCE DUE                                                  189.60`,
    planted: [{ label: "balance due 189.60 ≠ 149.60", match: /^$/, kinds: ["math_error"], amount: 40 }],
    clean: [/Call-out/i, /Labour/i, /valve/i],
  },
  // ---------------------------------------------------------------- stay / period day counts
  {
    id: "in-room-days",
    context: "Admitted on 10 Aug, discharged 13 Aug. General ward, no ICU. Cashless with Star Health.",
    text: `SUNRISE MULTISPECIALITY HOSPITAL — Pune, Maharashtra
Final Bill   UHID 4471920   Patient: Arjun Mehta   Payer: Star Health (cashless)
Admission: 2026-08-10   Discharge: 2026-08-13
DESCRIPTION                              QTY   RATE (INR)   AMOUNT (INR)
General ward room rent (per day)          4     3,200.00     12,800.00
Nursing charges (per day)                 4       800.00      3,200.00
Consultation - physician                  3     1,000.00      3,000.00
Pharmacy                                  1     6,450.00      6,450.00
Laboratory - CBC, LFT, KFT                1     2,900.00      2,900.00
SUBTOTAL                                                     28,350.00
AMOUNT PAYABLE                                               28,350.00`,
    planted: [
      { label: "room rent 4 days for 3 nights", match: /room rent/i, kinds: ["math_error", "other"] },
      { label: "nursing 4 days for 3 nights", match: /Nursing/i, kinds: ["math_error", "other"] },
    ],
    clean: [/Laboratory/i],
  },
  {
    id: "standing-days",
    context: "Gas bill for my flat. I pay by direct debit.",
    text: `CASTLE GAS — Edinburgh   Account 30-118-772
Bill period: 1 Jun 2026 – 30 Jun 2026   Bill date: 4 Jul 2026
Meter reading: 8,402 m³ (ACTUAL)   Previous: 8,330 m³ (ACTUAL)   72 m³ × 11.25 kWh/m³ = 810 kWh
DESCRIPTION                                   QTY     RATE     AMOUNT (GBP)
Gas usage (kWh)                               810     0.0620     50.22
Standing charge (days)                         33     0.3150     10.40
SUBTOTAL                                                        60.62
VAT 5%                                                           3.03
TOTAL DUE                                                       63.65`,
    planted: [{ label: "33 standing days in 30-day period", match: /Standing/i, kinds: ["math_error", "other"], mustMention: /33|30/, amount: 0.95 }],
    clean: [/Gas usage/i],
  },
  // ---------------------------------------------------------------- tax rules
  {
    id: "in-gst-clinic",
    context: "OPD consultation and blood test at a private clinic.",
    text: `CARE PLUS CLINIC — Bengaluru, Karnataka   Bill No. CP/26/7719   Date: 2026-09-14
Patient: Kavya Rao
DESCRIPTION                          QTY   RATE (INR)   AMOUNT (INR)
Consultation - general physician      1      800.00       800.00
Thyroid profile (T3, T4, TSH)         1      650.00       650.00
HbA1c                                 1      450.00       450.00
SUBTOTAL                                                1,900.00
GST 18%                                                   342.00
TOTAL                                                   2,242.00`,
    planted: [{ label: "18% GST on exempt healthcare", match: /^$/, kinds: ["other"], mustMention: /GST|tax|exempt/i }],
    clean: [/Consultation/i, /Thyroid/i, /HbA1c/i],
  },
  {
    id: "us-sales-tax-medical",
    context: "Dermatology visit to check a mole. In-network.",
    text: `SUMMIT DERMATOLOGY — Chicago, IL 60611
Statement 10/02/2026   Patient: Alex Kim   Insurance: Cigna (in-network)
DATE      CODE   DESCRIPTION                          QTY  UNIT     AMOUNT
09/20/26  99213  OFFICE VISIT EST PATIENT LEVEL 3      1   160.00   160.00
09/20/26  11102  TANGENTIAL BIOPSY SKIN SINGLE         1   210.00   210.00
SUBTOTAL                                                       370.00
SALES TAX 10.25%                                                37.93
INSURANCE PAID                                                -250.00
AMOUNT DUE                                                     157.93`,
    planted: [{ label: "sales tax on medical services", match: /^$/, kinds: ["other"], mustMention: /tax/i }],
    clean: [/OFFICE VISIT/i, /BIOPSY/i],
  },
  // ---------------------------------------------------------------- junk / discretionary fees
  {
    id: "late-fee-autopay",
    context: "Internet service. I'm on autopay and the payment went through on the due date, my bank confirms it.",
    text: `HIGHLINE FIBER — Account HF-882031   Statement 2026-10-05
Service period: 2026-09-05 to 2026-10-04
DESCRIPTION                                  QTY   RATE    AMOUNT (USD)
Fiber 500 Mbps                                1    55.00     55.00
Wi-Fi router rental                           1    12.00     12.00
Late payment fee                              1    15.00     15.00
SUBTOTAL                                                     82.00
TOTAL DUE                                                    82.00`,
    planted: [{ label: "late fee despite on-time autopay", match: /Late/i, kinds: ["late_fee", "other"] }],
    clean: [/Fiber 500/i],
  },
  {
    id: "cramming",
    context: "Basic phone line. I never signed up for any extra services or subscriptions.",
    text: `BLUEWAVE TELECOM — Account 7710-4421   Bill date: 2026-08-30
Billing period: 2026-08-01 to 2026-08-31
DESCRIPTION                                  QTY   RATE    AMOUNT (USD)
Talk & Text Basic plan                        1    25.00     25.00
Premium SMS horoscope service                 1     9.99      9.99
Third-party content: GameZone Plus            1    14.99     14.99
SUBTOTAL                                                     49.98
Taxes & fees                                                  4.10
TOTAL DUE                                                    54.08`,
    planted: [
      { label: "unauthorised premium SMS (cramming)", match: /horoscope/i, kinds: ["not_received", "other", "late_fee"] },
      { label: "unauthorised third-party content", match: /GameZone/i, kinds: ["not_received", "other", "late_fee"] },
    ],
    clean: [/Talk & Text/i],
  },
  // ---------------------------------------------------------------- services not received / upcoding
  {
    id: "icu-not-received",
    context: "My father was admitted for 2 nights of observation after chest pain, in a general ward. He was never moved to the ICU. Discharged on 4 July.",
    text: `CITY HEART HOSPITAL — Chennai, Tamil Nadu
Final Bill   UHID 5520193   Patient: R. Subramanian   Payer: Self
Admission: 2026-07-02   Discharge: 2026-07-04
DESCRIPTION                              QTY   RATE (INR)   AMOUNT (INR)
General ward room rent (per day)          2     2,800.00      5,600.00
ICU charges (per day)                     1    14,000.00     14,000.00
ECG                                       2       400.00        800.00
Troponin I                                1     1,200.00      1,200.00
Cardiology consultation                   2     1,500.00      3,000.00
SUBTOTAL                                                     24,600.00
AMOUNT PAYABLE                                               24,600.00`,
    planted: [{ label: "ICU charged but no ICU stay", match: /ICU/i, kinds: ["not_received", "other"] }],
    clean: [/ECG/i, /Troponin/i],
  },
  {
    id: "er-upcoding",
    context: "Went to the ER for a minor allergic rash. Seen for 20 minutes, given an antihistamine pill and sent home. No tests.",
    text: `RIVERSIDE GENERAL HOSPITAL — Columbus, OH 43215
Statement 06/15/2026   Patient: Morgan Lee   Insurance: Anthem PPO (in-network)
DATE      CODE   DESCRIPTION                          QTY  UNIT      AMOUNT
06/02/26  99285  ER VISIT LEVEL 5 - HIGH SEVERITY      1   2,400.00  2,400.00
06/02/26  J1200  DIPHENHYDRAMINE                       1      38.00     38.00
06/02/26  0450   ER FACILITY FEE                       1     950.00    950.00
SUBTOTAL                                                        3,388.00
INSURANCE PAID                                                 -1,100.00
AMOUNT DUE                                                      2,288.00`,
    planted: [{ label: "level-5 ER for minor rash", match: /LEVEL 5/i, kinds: ["upcoding"] }],
    clean: [],
  },
  {
    id: "unbundled-surgery",
    context: "Outpatient knee arthroscopy. Surgeon is in-network.",
    text: `LAKESIDE SURGERY CENTER — Minneapolis, MN 55401
Statement 05/30/2026   Patient: Chris Olsen   Insurance: Medica (in-network)
DATE      CODE   DESCRIPTION                                QTY  UNIT      AMOUNT
05/12/26  29881  KNEE ARTHROSCOPY W/ MENISCECTOMY            1   4,800.00  4,800.00
05/12/26  29870  DIAGNOSTIC KNEE ARTHROSCOPY (SEPARATE)      1   1,900.00  1,900.00
05/12/26  01400  ANESTHESIA KNEE PROCEDURE                   1   1,250.00  1,250.00
SUBTOTAL                                                              7,950.00
INSURANCE PAID                                                       -5,200.00
AMOUNT DUE                                                            2,750.00`,
    planted: [{ label: "diagnostic arthroscopy bundled into 29881", match: /DIAGNOSTIC/i, kinds: ["unbundling", "duplicate", "other"] }],
    clean: [/ANESTHESIA/i],
  },
  // ---------------------------------------------------------------- business invoice vs agreed terms
  {
    id: "saas-overbilled-seats",
    context: "Our contract is 25 seats at $30/seat/month, no add-ons. We were told onboarding was free.",
    text: `CLOUDDESK INC. — Invoice INV-55102   Date: 2026-10-01
Bill to: Acme Logistics Ltd
Service period: 2026-10-01 to 2026-10-31
DESCRIPTION                                  QTY   UNIT     AMOUNT (USD)
CloudDesk Pro seats                           32    30.00     960.00
Onboarding & setup                             1   450.00     450.00
SUBTOTAL                                                    1,410.00
TOTAL DUE                                                   1,410.00`,
    planted: [
      { label: "32 seats billed vs 25 contracted", match: /seats/i, kinds: ["not_received", "other", "price_outlier", "math_error"], mustMention: /25|seat/i },
      { label: "onboarding charged though free", match: /Onboarding/i, kinds: ["not_received", "other", "late_fee", "price_outlier"] },
    ],
    clean: [],
  },
  // ---------------------------------------------------------------- clean controls (must stay clean)
  {
    id: "clean-utility",
    context: "Electricity bill. Actual meter reading, matches what I submitted. Paid on time.",
    text: `GREENGRID POWER — Bristol, UK   Account 41-882-090
Bill period: 1 Aug 2026 – 31 Aug 2026   Bill date: 3 Sep 2026
Meter reading: 22,410 (ACTUAL)   Previous: 22,180 (ACTUAL)
DESCRIPTION                                   QTY     RATE     AMOUNT (GBP)
Electricity usage (kWh)                       230     0.2450     56.35
Standing charge (days)                         31     0.5000     15.50
SUBTOTAL                                                        71.85
VAT 5%                                                           3.59
TOTAL DUE                                                       75.44`,
    planted: [],
    clean: [/usage/i, /Standing/i],
  },
  {
    id: "clean-telecom",
    context: "Single mobile line, I chose this plan. Paid on time by autopay.",
    text: `NORTHWIND MOBILE — Account 5512-7781   Bill date: 2026-09-28
Billing period: 2026-09-01 to 2026-09-30
DESCRIPTION                                 QTY   RATE     AMOUNT (USD)
Essentials plan                              1    40.00     40.00
Device installment 6 of 24                   1    20.83     20.83
SUBTOTAL                                                    60.83
Taxes & surcharges                                           4.92
TOTAL DUE                                                   65.75`,
    planted: [],
    clean: [/Essentials/i, /installment/i],
  },
  {
    id: "clean-pharmacy-in",
    context: "Bought prescribed medicines at a pharmacy. Prices match the MRP printed on the strips.",
    text: `MEDPLUS PHARMACY — Hyderabad, Telangana   Bill No. MP/77120   Date: 2026-09-02
DESCRIPTION                          QTY   MRP (INR)   AMOUNT (INR)
Metformin 500mg (strip of 10)         3      32.00        96.00
Atorvastatin 10mg (strip of 10)       2      98.00       196.00
TOTAL                                                    292.00`,
    planted: [],
    clean: [/Metformin/i, /Atorvastatin/i],
  },
  {
    id: "clean-invoice",
    context: "Website maintenance retainer as agreed in our contract: 10 hours at 60 GBP/hour, VAT registered supplier.",
    text: `PIXELWORKS STUDIO LTD — 14 Kingsland Rd, London E2 8DA   VAT Reg No. GB 284 1937 06
Invoice PW-1093   Date: 30 Sep 2026   Payment terms: 30 days
Client: Harbour Books Ltd, 2 Quay St, Bristol BS1 4DB
DESCRIPTION                                 QTY   RATE      AMOUNT (GBP)
Website maintenance, Sep 2026 (hours)        10    60.00     600.00
SUBTOTAL                                                    600.00
VAT 20%                                                     120.00
TOTAL DUE                                                   720.00`,
    planted: [],
    clean: [/maintenance/i],
  },
];
