"use client";

import type { AuditResult } from "./types";

/** Lifecycle of a dispute after the audit: the "Resolve with oversight" stage. */
export type CaseStatus = "draft" | "sent" | "responded" | "resolved";

export interface CaseEvent {
  at: string; // ISO timestamp
  actor: "agent" | "user";
  action: string;
  detail?: string;
}

export interface DisputeCase {
  id: string;
  createdAt: string;
  provider: string;
  currency: string;
  totalBilled: number;
  confirmedTotal: number;
  suspectedTotal: number;
  approvedTotal: number;
  approvedIds: string[];
  status: CaseStatus;
  recovered: number; // money actually credited/refunded, entered by the user
  durationMs: number;
  findingsCount: number;
  result: AuditResult;
  letter: string;
  trail: CaseEvent[];
}

const KEY = "quibbill.cases.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: DisputeCase[] } = { raw: null, value: [] };
const EMPTY: DisputeCase[] = [];

export function loadCases(): DisputeCase[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(KEY);
  if (raw === cache.raw) return cache.value; // stable reference for useSyncExternalStore
  try {
    cache = { raw, value: JSON.parse(raw || "[]") };
  } catch {
    cache = { raw, value: [] };
  }
  return cache.value;
}

export function subscribeCases(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const serverCases = () => EMPTY;

export function saveCases(cases: DisputeCase[]) {
  localStorage.setItem(KEY, JSON.stringify(cases.slice(0, 50)));
  listeners.forEach((l) => l());
}

export function upsertCase(c: DisputeCase) {
  const all = loadCases().filter((x) => x.id !== c.id);
  saveCases([c, ...all]);
}

export function deleteCase(id: string) {
  saveCases(loadCases().filter((x) => x.id !== id));
}

export const now = () => new Date().toISOString();

/** Build the agent's part of the audit trail from a finished audit. */
export function agentTrail(r: AuditResult): CaseEvent[] {
  const t = now();
  const steps: CaseEvent[] = [
    { at: t, actor: "agent", action: "Read the bill", detail: `${r.bill.lineItems.length} line items · ${r.models.extract ?? ""}` },
    { at: t, actor: "agent", action: "Ran deterministic checks", detail: `${r.findings.filter((f) => f.source === "rule").length} issue(s)` },
  ];
  if (r.models.research) steps.push({ at: t, actor: "agent", action: "Researched benchmarks & consumer law", detail: "Tavily" });
  steps.push({
    at: t,
    actor: "agent",
    action: "Completed deep audit",
    detail: `${r.findings.filter((f) => f.source === "ai").length} finding(s) · ${r.models.audit ?? ""}`,
  });
  if (r.letter) steps.push({ at: t, actor: "agent", action: "Drafted dispute letter", detail: r.models.letter });
  return steps;
}

export function newCaseId() {
  return `QB-${Date.now().toString(36).toUpperCase()}`;
}
