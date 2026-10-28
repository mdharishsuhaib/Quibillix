/**
 * Accuracy benchmark: bills with PLANTED errors (ground truth) + one clean bill (false-positive check).
 * Each planted issue lists the line it lives on and the kinds we accept as a correct detection.
 */
import type { IssueKind } from "../src/lib/types";

export interface Planted {
  label: string;
  match: RegExp; // matches the line description the issue lives on ("" = bill-level)
  kinds: IssueKind[];
  mustMention?: RegExp; // the finding's title/explanation must show it understood WHY (not just hit the line)
}

export interface EvalCase {
  id: string;
  context: string;
  text: string;
  planted: Planted[];
  /** Line descriptions that are legitimate and must NOT be flagged with money attached. */
  clean: RegExp[];
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "clinic-us",
    context: "Routine annual physical with my in-network primary care doctor. Blood draw only, no other procedures. Paid my copay at the desk.",
    text: `LAKEVIEW FAMILY MEDICINE — Denver, CO 80203
Statement date: 08/14/2026   Patient: Sam Ortiz   Insurance: Aetna PPO (in-network)
DATE      CODE   DESCRIPTION                              QTY  UNIT     AMOUNT
08/01/26  99396  PREVENTIVE VISIT EST PATIENT 40-64        1   310.00   310.00
08/01/26  36415  VENIPUNCTURE                              1    25.00    25.00
08/01/26  80053  COMPREHENSIVE METABOLIC PANEL             1    95.00    95.00
08/01/26  80053  COMPREHENSIVE METABOLIC PANEL             1    95.00    95.00
08/01/26  85025  CBC W/ DIFFERENTIAL                       2    48.00   126.00
08/01/26  99000  SPECIMEN HANDLING                         1    40.00    40.00
SUBTOTAL                                                           691.00
INSURANCE PAID                                                    -420.00
COPAY RECEIVED                                                     -30.00
AMOUNT DUE                                                         271.00`,
    planted: [
      { label: "duplicate CMP", match: /METABOLIC/i, kinds: ["duplicate"] },
      { label: "CBC math (2×48≠126)", match: /CBC/i, kinds: ["math_error"] },
      { label: "specimen handling bundled into venipuncture", match: /SPECIMEN/i, kinds: ["unbundling", "other", "price_outlier"] },
    ],
    clean: [/PREVENTIVE/i, /VENIPUNCTURE/i],
  },
  {
    id: "utility-uk",
    context: "Single-person flat. I submitted an actual meter reading of 14,250 on 30 Sept. I pay by direct debit on time every month.",
    text: `BRIGHTSPARK ENERGY — Manchester, UK      Account 77-2093-11
Bill period: 1 Sep 2026 – 30 Sep 2026     Bill date: 3 Oct 2026
Meter reading: 14,610 (ESTIMATED)   Previous: 14,010 (ACTUAL)

DESCRIPTION                                   QTY     RATE     AMOUNT (GBP)
Electricity usage (kWh)                       600     0.2450    147.00
Standing charge (days)                         31     0.6050     18.76
Smart meter rental                              1     4.50       4.50
Late payment fee                                1    12.00      12.00
Paper bill fee                                  1     2.50       2.50

SUBTOTAL                                                       184.76
VAT 5%                                                           9.24
TOTAL DUE                                                      194.00`,
    planted: [
      { label: "estimated read vs actual (240 kWh, not 600)", match: /usage/i, kinds: ["price_outlier", "not_received", "other", "math_error"], mustMention: /estimat|actual\s*(meter\s*)?read|14,?250|240/i },
      { label: "31 standing-charge days in a 30-day period", match: /standing/i, kinds: ["math_error", "other"], mustMention: /31|30/ },
      { label: "late fee despite on-time direct debit", match: /late/i, kinds: ["late_fee", "other", "not_received"] },
      { label: "paper bill fee", match: /paper/i, kinds: ["late_fee", "other"] },
    ],
    clean: [],
  },
  {
    id: "clean-dental",
    context: "Routine cleaning and exam with my regular dentist. Everything on the bill happened and the prices match what they quoted me.",
    text: `BRIGHT SMILES DENTAL — Austin, TX 78704
Statement 09/10/2026   Patient: Lee Chen   Self-pay (quoted prices)
DATE      CODE   DESCRIPTION                       QTY  UNIT    AMOUNT
09/02/26  D0120  PERIODIC ORAL EVALUATION           1   65.00    65.00
09/02/26  D1110  PROPHYLAXIS - ADULT                1   110.00  110.00
09/02/26  D0274  BITEWINGS - FOUR RADIOGRAPHIC      1   72.00    72.00
SUBTOTAL                                                     247.00
AMOUNT DUE                                                   247.00`,
    planted: [],
    clean: [/EVALUATION/i, /PROPHYLAXIS/i, /BITEWING/i],
  },
];
