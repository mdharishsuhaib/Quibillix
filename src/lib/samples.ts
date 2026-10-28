export interface Sample {
  id: string;
  label: string;
  blurb: string;
  context: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "us-er",
    label: "US emergency room visit",
    blurb: "Sprained ankle, $6,447 due",
    context:
      "I went to the ER for a sprained ankle. I was there about 2 hours, got an X-ray and an ankle wrap, and took one ibuprofen. I have Blue Cross PPO and the hospital was in-network, but the ER doctor group was apparently out-of-network.",
    text: `ST. MERIDIAN REGIONAL MEDICAL CENTER
1200 Lakeshore Dr, Austin, TX 78701
PATIENT STATEMENT                Statement Date: 09/22/2026
Patient: Jordan Avery            Account #: 88-401773
Insurance: Blue Cross Blue Shield of Texas PPO

DATE       CODE    DESCRIPTION                                   QTY   UNIT      AMOUNT
09/03/26   99285   ER VISIT LEVEL 5 - HIGH SEVERITY               1    2,950.00  2,950.00
09/03/26   73610   X-RAY ANKLE COMPLETE 3+ VIEWS                  1      612.00    612.00
09/03/26   73610   X-RAY ANKLE COMPLETE 3+ VIEWS                  1      612.00    612.00
09/03/26   85025   CBC W/ AUTO DIFFERENTIAL                       1      284.00    284.00
09/03/26   36415   VENIPUNCTURE ROUTINE                           1       78.00     78.00
09/03/26   J8499   IBUPROFEN 800MG TAB                            1       47.00     47.00
09/03/26   A4570   ELASTIC BANDAGE / ANKLE WRAP                   1      189.00    189.00
09/03/26   99070   SUPPLIES - GLOVES, GAUZE, ALCOHOL PADS         3       65.00    235.00
09/03/26   0450    ER FACILITY FEE                                1    1,205.00  1,205.00
09/03/26   99285   PHYSICIAN SVCS - EMERG MED ASSOC (OUT-OF-NETWORK) 1  1,180.00  1,180.00

SUBTOTAL                                                                      7,392.00
INSURANCE PAYMENT (BCBS)                                                       -980.00
LATE PAYMENT FEE                                                                 35.00
AMOUNT DUE                                                                    6,447.00`,
  },
  {
    id: "in-hospital",
    label: "India private hospital (INR)",
    blurb: "3-day dengue admission, ₹1.86 lakh",
    context:
      "My father was admitted for 3 nights (2 Oct to 5 Oct) for dengue in a general ward-equivalent twin-sharing room. Cashless claim under Star Health; they said the remainder is ours to pay. He never had an ICU stay.",
    text: `SUNRISE MULTISPECIALITY HOSPITAL, Whitefield, Bengaluru, Karnataka
FINAL IP BILL     Bill No: IP/26/10/4471     Date: 05-Oct-2026
Patient: Ramesh K. (64 M)    UHID: SMH-209981    Payer: Star Health (Cashless)
Admission: 02-Oct-2026   Discharge: 05-Oct-2026   Room: Twin Sharing

SL  DATE        DESCRIPTION                                 QTY   RATE      AMOUNT (INR)
1   02-Oct-26   Room Rent - Twin Sharing                     4    6,500.00   26,000.00
2   02-Oct-26   ICU Monitoring Charges                       1   18,000.00   18,000.00
3   02-Oct-26   Admission / Registration Charges             1    2,500.00    2,500.00
4   02-Oct-26   Consultation - Physician (daily)             4    2,000.00    8,000.00
5   03-Oct-26   Complete Blood Count (CBC)                   6      750.00    4,500.00
6   03-Oct-26   Dengue NS1 Antigen                           1    1,800.00    1,800.00
7   03-Oct-26   Dengue NS1 Antigen                           1    1,800.00    1,800.00
8   03-Oct-26   Platelet Transfusion (SDP)                   1   38,000.00   38,000.00
9   03-Oct-26   Paracetamol 650mg Tab (per strip of 15)      2      480.00      960.00
10  03-Oct-26   IV Fluids - Normal Saline 500ml              12     340.00    4,080.00
11  03-Oct-26   Gloves, Masks, PPE Kit (Consumables)         1    6,200.00    6,200.00
12  04-Oct-26   Nursing Charges                              4    1,500.00    6,000.00
13  04-Oct-26   Medical Records / Documentation Fee          1    1,200.00    1,200.00
14  04-Oct-26   Pharmacy - Misc                              1   21,450.00   21,450.00
15  05-Oct-26   Equipment Charges - Multipara Monitor        3    2,800.00    8,400.00
16  05-Oct-26   Service Charge (10% of bill)                 1   14,889.00   14,889.00

GROSS TOTAL                                                                 1,63,779.00
GST                                                                           22,640.00
LESS: Star Health approved amount                                            -85,000.00
NET PAYABLE BY PATIENT                                                      1,01,419.00`,
  },
  {
    id: "telecom",
    label: "Mobile + broadband bill",
    blurb: "Monthly bill with mystery add-ons",
    context:
      "I'm on the 'Unlimited Plus' plan at $70/month with autopay. I never signed up for any 'Premium Content' or device protection, and my autopay went through on time.",
    text: `NOVALINK WIRELESS                     Account 5530-1129-88
Bill period: Sep 12 – Oct 11, 2026     Due: Nov 1, 2026
Service address: Seattle, WA

PLAN & SERVICES                                       AMOUNT
Unlimited Plus (1 line)                                 70.00
Autopay discount                                        0.00
Device Protection Plus                                  17.00
Premium Content Pack (3rd-party: GameZone+)             12.99
Premium Content Pack (3rd-party: GameZone+)             12.99
Home Broadband 300 Mbps                                 55.00
Equipment rental - Router                               15.00
Administrative Fee                                       4.99
Regulatory Cost Recovery Fee                             3.49
Late Payment Charge                                     10.00
Paper Statement Fee                                      2.00

SUBTOTAL                                               206.45
Taxes & government surcharges                           21.70
TOTAL DUE                                              228.15`,
  },
];
