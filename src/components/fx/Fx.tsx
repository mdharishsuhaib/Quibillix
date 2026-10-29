"use client";

import { useEffect } from "react";

/**
 * Global, dependency-free interaction layer:
 *  - `.spot`      surfaces get a cursor-following light (CSS vars --mx/--my)
 *  - `.magnetic`  elements lean toward the pointer a few pixels
 * One passive listener for the whole app; disabled for reduced motion and touch.
 */
export default function Fx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    let magnet: HTMLElement | null = null;

    const frame = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const t = e.target as Element | null;
      const spot = t?.closest?.(".spot") as HTMLElement | null;
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      if (reduce) return;
      const m = t?.closest?.(".magnetic") as HTMLElement | null;
      if (magnet && magnet !== m) magnet.style.transform = "";
      magnet = m;
      if (m && !(m as HTMLButtonElement).disabled) {
        const r = m.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        m.style.transform = `translate(${dx * 6}px, ${dy * 5}px)`;
      }
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      if (magnet) magnet.style.transform = "";
      magnet = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
