"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const MOTION_Q = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(MOTION_Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * The whole product in one looping 3D scene (CSS 3D, no WebGL):
 * a bill arrives -> every line is checked -> wrong lines lift out with evidence ->
 * you approve -> a dispute letter is drafted from approved items only -> money comes back.
 * Numbers are from the bundled US ER sample (src/lib/samples.ts) and add up.
 */

const STEP_MS = 3400;
const APPROVE_MS = 4000; // two clicks, then a beat to read "Approved" before Dispute
const W = 560;
const H = 400;

const ROWS: { d: string; a: string; flag?: "coral" | "warn" }[] = [
  { d: "ER visit, level 5", a: "2,950.00", flag: "warn" },
  { d: "X-ray, ankle, 2 views", a: "612.00", flag: "coral" }, // the original...
  { d: "X-ray, ankle, 2 views", a: "612.00", flag: "coral" }, // ...and its duplicate: both lines are the finding
  { d: "CBC blood panel", a: "284.00" },
  { d: "Ibuprofen 800 mg", a: "47.00" },
  { d: "Supplies 3 × 65.00", a: "235.00", flag: "coral" },
  { d: "Physician services", a: "1,180.00" },
];

const FINDINGS = [
  { title: "X-ray billed twice", amt: "−$612.00", tone: "coral", kind: "Confirmed", row: 2, source: "Same code, same day" },
  { title: "3 × 65 isn't 235", amt: "−$40.00", tone: "coral", kind: "Confirmed", row: 5, source: "Math re-checked" },
  { title: "Level 5 for a sprain?", amt: "Ask first", tone: "warn", kind: "Suspected", row: 0, source: "CMS E/M levels" },
] as const;

const STEPS = [
  { k: "Read", say: "Drop in any bill: a PDF, a photo or pasted text. Nemotron reads every line item." },
  { k: "Check", say: "Each line is re-added and cross-checked. Math errors are proven, not guessed." },
  { k: "Explain", say: "Every catch lifts off the bill with its reason and evidence from live sources." },
  { k: "Approve", say: "You choose what to dispute. Suspected items wait for your call." },
  { k: "Dispute", say: "A letter and phone script are drafted from only the items you approved." },
  { k: "Recover", say: "Track the case to the end and log the money you get back." },
];

const ROW_TOP = 78; // first row's top inside the bill
const ROW_H = 26;
const rowY = (i: number) => -150 + ROW_TOP + i * ROW_H + ROW_H / 2; // row centre relative to bill centre

type Pose = { t: string; o: number; d?: number };

const billPose = (s: number): Pose =>
  s === 0
    ? { t: "translate3d(-128px,0,0) rotateY(16deg)", o: 1 }
    : s <= 3
      ? { t: "translate3d(-138px,0,0) rotateY(20deg)", o: 1 }
      : s === 4
        ? { t: "translate3d(-182px,6px,-120px) rotateY(26deg)", o: 0.55 }
        : { t: "translate3d(-198px,8px,-180px) rotateY(28deg)", o: 0.3 };

const cardPose = (i: number, s: number): Pose => {
  if (s < 2) return { t: `translate3d(-138px,${rowY(FINDINGS[i].row)}px,0) scale(0.5)`, o: 0 };
  if (s <= 3) return { t: `translate3d(122px,${-104 + i * 84}px,${90 - i * 10}px) rotateY(-16deg)`, o: 1, d: i * 140 };
  if (i < 2) return { t: `translate3d(34px,${-2 + i * 26}px,60px) scale(0.3)`, o: 0, d: i * 120 };
  return { t: `translate3d(168px,122px,0) rotateY(-16deg) scale(0.78)`, o: s === 4 ? 0.45 : 0 };
};

const letterPose = (s: number): Pose =>
  s < 4
    ? { t: "translate3d(40px,60px,-80px) rotateX(-24deg) scale(0.9)", o: 0 }
    : s === 4
      ? { t: "translate3d(36px,0,60px) rotateY(-12deg)", o: 1, d: 200 }
      : { t: "translate3d(250px,-190px,40px) rotateZ(-16deg) scale(0.3)", o: 0 };

const refundPose = (s: number): Pose =>
  s < 5 ? { t: "translate3d(46px,80px,30px) rotateY(-12deg)", o: 0 } : { t: "translate3d(46px,-6px,110px) rotateY(-14deg)", o: 1, d: 350 };

const style = (p: Pose) => ({ transform: p.t, opacity: p.o, transitionDelay: `${p.d ?? 0}ms` });

const TONE = {
  coral: { row: "rgb(255 113 141 / 0.28)", ink: "text-coral", pin: "bg-coral" },
  warn: { row: "rgb(255 198 109 / 0.32)", ink: "text-warn", pin: "bg-warn" },
} as const;

export default function BillJourney3D() {
  const reduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION_Q).matches, () => false);
  const [rawStep, setStep] = useState(0);
  const [cycle, setCycle] = useState(0); // remounts the typing rows each loop
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const step = reduce && rawStep === 0 ? 2 : rawStep; // reduced motion opens on the most telling frame

  // Approve step: badges read "Approve" until the pointer clicks each one (times match the cursor keyframes in globals.css).
  const [clicks, setClicks] = useState({ key: "", n: 0, pressed: -1 });
  const live = clicks.key === `3-${cycle}` ? clicks : { n: 0, pressed: -1 };
  const n = step > 3 || (step === 3 && reduce) ? 3 : step === 3 ? live.n : 0; // 1 = first approved, 2 = second, 3 = suspected one held
  const pressed = step === 3 ? live.pressed : -1;
  const approvedNow = (i: number) => n > i;
  const badgeShown = (i: number) => step >= 3 && (i < 2 || n >= 3);
  useEffect(() => {
    if (step !== 3 || reduce) return;
    const key = `3-${cycle}`;
    const at = (ms: number, v: { n: number; pressed: number }) => setTimeout(() => setClicks({ key, ...v }), ms);
    // cursor: 2.6s with 200ms delay; it presses at 34% (≈1.08s) and 68% (≈1.97s)
    const ts = [
      at(1080, { n: 0, pressed: 0 }),
      at(1240, { n: 1, pressed: -1 }),
      at(1970, { n: 1, pressed: 1 }),
      at(2130, { n: 2, pressed: -1 }),
      at(2600, { n: 3, pressed: -1 }),
    ];
    return () => ts.forEach(clearTimeout);
  }, [step, cycle, reduce]);

  // Tilt toward the pointer, sway when idle, fit the stage to its box.
  useEffect(() => {
    const view = viewRef.current!;
    const stage = stageRef.current!;
    const rm = window.matchMedia(MOTION_Q).matches;
    let scale = 1;
    let raf = 0;
    const p = { x: 0, y: 0, tx: 0, ty: 0, active: false };
    const fit = () => {
      const r = view.getBoundingClientRect();
      scale = Math.min(r.width / W, r.height / H, 1.2);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(view);
    fit();
    const move = (e: PointerEvent) => {
      const r = view.getBoundingClientRect();
      p.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      p.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      p.active = true;
    };
    const leave = () => {
      p.active = false;
      p.tx = 0;
      p.ty = 0;
    };
    view.addEventListener("pointermove", move);
    view.addEventListener("pointerleave", leave);
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting));
    io.observe(view);
    const tick = (time: number) => {
      const t = time / 1000;
      const sway = rm || p.active ? 0 : 1;
      p.x += (p.tx - p.x) * 0.06;
      p.y += (p.ty - p.y) * 0.06;
      const ry = p.x * 14 + Math.sin(t * 0.45) * 5 * sway;
      const rx = 4 - p.y * 9 + Math.sin(t * 0.32) * 2 * sway;
      stage.style.transform = `scale(${scale}) rotateX(${rx}deg) rotateY(${ry}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerleave", leave);
    };
  }, []);

  const go = (s: number) => {
    if (s === 0) setCycle((c) => c + 1);
    setStep(s);
  };
  const next = () => go((step + 1) % STEPS.length);
  const playing = !reduce && !paused && !offscreen;

  return (
    <div className="flex h-full flex-col">
      <div ref={viewRef} className="bj-view relative min-h-0 flex-1" aria-hidden>
        <div ref={stageRef} className="bj-stage">
          <div className="bj-floor" />
          <div className="bj-shadow" style={{ transform: `translate3d(${step >= 4 ? -190 : -134}px,196px,0) rotateX(90deg)`, opacity: step >= 4 ? 0.25 : 0.6 }} />

          {/* 1. The bill */}
          <div className="bj-obj paper" style={{ width: 230, height: 300, margin: "-150px 0 0 -115px", borderRadius: 6, ...style(billPose(step)) }}>
            <div className="px-4 pt-4">
              <p className="text-[12px] font-semibold leading-tight">St. Meridian Regional</p>
              <p className="text-[10px] leading-tight opacity-60">Emergency department · acct 4471-22</p>
              <div className="mt-3 h-px bg-paper-ink/20" />
            </div>
            <ul key={cycle} className="absolute inset-x-0" style={{ top: ROW_TOP }}>
              {ROWS.map((r, i) => {
                const lit = step >= 1 && r.flag;
                return (
                  <li
                    key={i}
                    className="bj-row flex items-center justify-between px-4 font-mono text-[10.5px]" /* taste-skill-ignore: bill line items keep their column alignment */
                    style={{
                      height: ROW_H,
                      animationDelay: `${i * 90 + 250}ms`,
                      background: lit ? TONE[r.flag!].row : "transparent",
                      transition: "background-color 500ms ease",
                      transitionDelay: step === 1 ? `${300 + i * 240}ms` : "0ms",
                    }}
                  >
                    <span className="truncate">{r.d}</span>
                    <span className="num">{r.a}</span>
                  </li>
                );
              })}
            </ul>
            <div className="absolute inset-x-4 bottom-4 flex justify-between border-t border-paper-ink/25 pt-2 font-mono text-[11px] font-semibold" /* taste-skill-ignore: bill total */>
              <span>Total due</span>
              <span className="num">$5,920.00</span>
            </div>
            {step === 1 && <div key={`scan-${cycle}`} className="bj-scan" style={{ top: ROW_TOP - 30 }} />}
          </div>

          {/* 2. Findings lifting off the bill */}
          {FINDINGS.map((f, i) => {
            const tone = TONE[f.tone];
            const held = f.tone === "warn";
            return (
              <div key={f.title} className="bj-obj" style={{ width: 222, height: 70, margin: "-35px 0 0 -111px", ...style(cardPose(i, step)) }}>
                <div className="relative h-full rounded-[8px] border border-steel bg-carbon px-3 pb-2.5 pt-3.5">
                  <span className={`absolute left-0 top-2.5 h-[calc(100%-20px)] w-[3px] rounded-r ${tone.pin}`} />
                  <p className="flex items-center justify-between gap-2 text-[12.5px] font-semibold leading-tight text-frost">
                    <span className="truncate">{f.title}</span>
                    <span className={`num shrink-0 ${tone.ink}`}>{f.amt}</span>
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-mist">
                    <span className={tone.ink}>{f.kind}</span>
                    <span className="text-dim">·</span>
                    <span className="truncate text-cobalt">{f.source}</span>
                  </p>
                  <span
                    className={`bj-badge absolute -top-3 left-2.5 grid h-[22px] place-items-center rounded-full border px-2 text-[10.5px] font-semibold ${
                      held ? "border-steel bg-raised text-warn" : approvedNow(i) ? "border-glacier bg-glacier text-on-accent" : "border-glacier bg-carbon text-glacier"
                    }`}
                    style={{
                      opacity: badgeShown(i) ? 1 : 0,
                      transform: `translateZ(24px) scale(${pressed === i ? 0.88 : badgeShown(i) ? 1 : 0.6})`,
                      transitionDelay: "0ms",
                    }}
                  >
                    {held ? "Held for you" : approvedNow(i) ? "✓ Approved" : "Approve"}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Your pointer: travels to each "Approve" and clicks it (keyframes in globals.css, click times above) */}
          {step === 3 && !reduce && (
            <div key={`cursor-${cycle}`} className="bj-cursor" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--frost)" stroke="var(--carbon)" strokeWidth="1.5">
                <path d="M5 3l14 8-6.5 1.5L9 19z" />
              </svg>
            </div>
          )}

          {/* 3. The dispute letter */}
          <div className="bj-obj paper" style={{ width: 216, height: 264, margin: "-132px 0 0 -108px", borderRadius: 6, ...style(letterPose(step)) }}>
            <div className="p-4 text-[10.5px] leading-snug">
              <p className="font-semibold">To: St. Meridian billing office</p>
              <p className="opacity-60">Re: acct 4471-22, billing dispute</p>
              <div className="mt-3 space-y-1.5">
                {[92, 100, 76].map((w, i) => (
                  <div key={i} className="h-1.5 rounded-full bg-paper-ink/15" style={{ width: `${w}%` }} />
                ))}
              </div>
              <ul className="mt-3 space-y-1 font-mono text-[10px]" /* taste-skill-ignore: disputed amounts in the letter */>
                <li className="flex justify-between">
                  <span>Duplicate X-ray</span>
                  <span className="num">612.00</span>
                </li>
                <li className="flex justify-between">
                  <span>Supplies math</span>
                  <span className="num">40.00</span>
                </li>
              </ul>
              <div className="mt-2 flex justify-between border-t border-paper-ink/25 pt-1.5 font-semibold">
                <span>Total disputed</span>
                <span className="num">$652.00</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {[100, 64].map((w, i) => (
                  <div key={i} className="h-1.5 rounded-full bg-paper-ink/15" style={{ width: `${w}%` }} />
                ))}
              </div>
              <p className="mt-3 text-[10px] opacity-60">Sent only when you say so</p>
            </div>
          </div>

          {/* 4. Money back */}
          <div className="bj-obj" style={{ width: 236, height: 150, margin: "-75px 0 0 -118px", ...style(refundPose(step)) }}>
            <div className="h-full rounded-[12px] border border-steel bg-carbon p-4">
              <p className="text-[12px] text-mist">Recovered on this bill</p>
              <p className="num mt-1 text-[34px] font-semibold leading-none text-mint">+$652.00</p>
              <ol className="mt-4 flex items-center gap-2 text-[11px] text-mist">
                {["Draft", "Sent", "Resolved"].map((s, i) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-mint transition-opacity duration-300"
                      style={{ opacity: step >= 5 ? 1 : 0.2, transitionDelay: step >= 5 ? `${700 + i * 260}ms` : "0ms" }}
                    />
                    {s}
                    {i < 2 && <span className="ml-0.5 text-dim">→</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* The six steps: auto-plays, click any to jump; hovering the steps pauses. */}
      <div className="px-5 pb-5 sm:px-7" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
        <ol className="grid grid-cols-6 gap-1.5" aria-label="How Quibillix works">
          {STEPS.map((s, i) => {
            const cur = i === step;
            return (
              <li key={s.k}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={cur ? "step" : undefined}
                  className={`w-full pt-2 text-left text-[12px] font-medium transition-colors sm:text-[13px] ${cur ? "text-frost" : i < step ? "text-mist" : "text-dim hover:text-mist"}`}
                >
                  <span className="relative mb-2 block h-[2px] overflow-hidden rounded-full bg-steel">
                    <span
                      key={cur ? `${step}-${cycle}` : "idle"}
                      className={`absolute inset-0 origin-left rounded-full bg-glacier ${cur && !reduce ? "bj-fill" : ""}`}
                      style={{
                        transform: i < step || (cur && reduce) ? "scaleX(1)" : cur ? undefined : "scaleX(0)",
                        animationDuration: `${i === 3 ? APPROVE_MS : STEP_MS}ms`,
                        animationPlayState: playing ? "running" : "paused",
                      }}
                      onAnimationEnd={cur ? next : undefined}
                    />
                  </span>
                  <span className="num hidden text-dim sm:inline">{i + 1}</span> {s.k}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 min-h-[2.8em] text-[15px] leading-snug text-frost/90">{STEPS[step].say}</p>
      </div>
    </div>
  );
}
