"use client";

import { useEffect, useRef, useState } from "react";

/** Eases a number from its previous value to `value` (expo-out). Static when motion is reduced. */
export function useCountUp(value: number, ms = 1100) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    if (reduce || start === value) {
      from.current = value;
      const id = requestAnimationFrame(() => setV(value));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const cur = start + (value - start) * e;
      setV(cur);
      from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

export default function CountUp({ value, format, ms, className }: { value: number; format: (n: number) => string; ms?: number; className?: string }) {
  const v = useCountUp(value, ms);
  return <span className={`tabular-nums ${className ?? ""}`}>{format(v)}</span>;
}
