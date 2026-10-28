// Unit test for the Tavily privacy guard. Usage: npx tsx scripts/test-redact.ts
import { redactQuery } from "../src/lib/pipeline";

const bill = { patientOrAccount: "Jordan Avery, Account #: 88-401773" };
const cases: [string, { mustKeep: RegExp[]; mustDrop: RegExp[] }][] = [
  ["CPT 99285 Medicare fee schedule Austin TX 2026", { mustKeep: [/99285/, /2026/, /Austin/], mustDrop: [] }],
  ["Jordan Avery ER bill 99285 73610 Blue Cross 2026", { mustKeep: [/99285 73610/, /2026/], mustDrop: [/Jordan/i, /Avery/i] }],
  ["account 88-401773 balance billing No Surprises Act", { mustKeep: [/No Surprises Act/], mustDrop: [/401773/] }],
  ["call +1 512-555-0199 about claim # CLM2026884 HCPCS A4570 price", { mustKeep: [/A4570/], mustDrop: [/555-0199/, /CLM2026884/] }],
  ["UHID 400918273 GST exemption hospital India 2026", { mustKeep: [/GST/, /2026/], mustDrop: [/400918273/] }],
  ["email jordan.avery@mail.com hospital price", { mustKeep: [/hospital price/], mustDrop: [/@/] }],
];

let fail = 0;
for (const [q, { mustKeep, mustDrop }] of cases) {
  const out = redactQuery(q, bill);
  const ok = mustKeep.every((r) => r.test(out)) && mustDrop.every((r) => !r.test(out));
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  "${q}"\n      → "${out}"`);
}
process.exit(fail ? 1 : 0);
