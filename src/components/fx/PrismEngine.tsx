"use client";

import { useEffect, useRef } from "react";

type RGB = [number, number, number];
const GLACIER: RGB = [32, 227, 206];
const COBALT: RGB = [71, 123, 255];
const UV: RGB = [182, 108, 255];
const CORAL: RGB = [255, 113, 141];
const AMBER: RGB = [255, 198, 109];
const FROST: RGB = [244, 247, 255];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const spectrum = (t: number): RGB => (t < 0.5 ? mix(GLACIER, COBALT, t * 2) : mix(COBALT, UV, (t - 0.5) * 2));

/** Things the prism "catches", cycling: the bill goes in white, these refract out warm. */
const CATCHES: { label: string; tone: RGB }[] = [
  { label: "DUPLICATE X-RAY   −$612.00", tone: CORAL },
  { label: "GST ON EXEMPT CARE   −₹4,320", tone: CORAL },
  { label: "ER LEVEL 5 · 2 HRS   UPCODED?", tone: AMBER },
  { label: "LATE FEE · PAID ON TIME   −$35.00", tone: CORAL },
  { label: "3 NIGHTS BILLED AS 4   −₹9,500", tone: CORAL },
  { label: "SUPPLIES 3 × 65 ≠ 235   −$40.00", tone: CORAL },
  { label: "ROAMING · NEVER LEFT CITY   ?", tone: AMBER },
];

const RAYS = 7;

export default function PrismEngine({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    // Particles riding the beams: ray -1 is the incoming white beam.
    const parts = Array.from({ length: 90 }, (_, i) => ({ ray: (i % (RAYS + 2)) - 1, t: Math.random(), v: 0.0025 + Math.random() * 0.004 }));

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      pointer.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };

    const draw = (time: number) => {
      const t = time / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      ctx.clearRect(0, 0, w, h);

      // ---- perspective floor grid, scrolling toward the viewer ----
      const horizon = h * 0.64;
      const vx = w * 0.5 + pointer.x * 30;
      ctx.lineWidth = 1;
      for (let i = -14; i <= 14; i++) {
        const bx = w * 0.5 + i * (w / 9);
        const g = ctx.createLinearGradient(0, horizon, 0, h);
        g.addColorStop(0, rgba(COBALT, 0));
        g.addColorStop(1, rgba(COBALT, 0.16));
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(vx, horizon);
        ctx.lineTo(bx, h);
        ctx.stroke();
      }
      const scroll = reduce ? 0.4 : (t * 0.35) % 1;
      for (let k = 0; k < 9; k++) {
        const z = (k + scroll) / 9;
        const y = horizon + (h - horizon) * z * z;
        ctx.strokeStyle = rgba(COBALT, 0.14 * z);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // ---- prism geometry (extruded triangle for a 3D read) ----
      const cx = w * 0.46;
      const cy = h * 0.47;
      const s = Math.min(w * 0.17, h * 0.33);
      const rot = -Math.PI / 2 + pointer.x * 0.08 + Math.sin(t * 0.6) * 0.02;
      const tri = [0, 1, 2].map((k) => {
        const a = rot + (k * Math.PI * 2) / 3;
        return { x: cx + Math.cos(a) * s, y: cy + Math.sin(a) * s };
      });
      const depth = { x: 18 + pointer.x * 14, y: -12 + pointer.y * 8 };
      const back = tri.map((p) => ({ x: p.x + depth.x, y: p.y + depth.y }));

      // faces of the extrusion
      for (let k = 0; k < 3; k++) {
        const a = tri[k];
        const b = tri[(k + 1) % 3];
        const a2 = back[k];
        const b2 = back[(k + 1) % 3];
        ctx.fillStyle = rgba(k === 0 ? COBALT : k === 1 ? UV : GLACIER, 0.05);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = rgba(FROST, 0.12);
      ctx.beginPath();
      back.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(tri[k].x, tri[k].y);
        ctx.lineTo(back[k].x, back[k].y);
        ctx.stroke();
      }

      // entry (left face) and exit (right face) points
      const top = tri[0];
      const right = tri[1];
      const left = tri[2];
      const pin = { x: left.x + (top.x - left.x) * 0.52, y: left.y + (top.y - left.y) * 0.52 };
      const pout = { x: right.x + (top.x - right.x) * 0.42, y: right.y + (top.y - right.y) * 0.42 };
      const src = { x: -10, y: cy + s * 0.55 + pointer.y * 10 };

      // ---- incoming white light: the bill ----
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const inG = ctx.createLinearGradient(src.x, src.y, pin.x, pin.y);
      inG.addColorStop(0, rgba(FROST, 0));
      inG.addColorStop(1, rgba(FROST, 0.85));
      ctx.strokeStyle = inG;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = rgba(FROST, 0.8);
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(pin.x, pin.y);
      ctx.stroke();

      // inside the glass: a soft fan
      ctx.shadowBlur = 0;
      const fan = ctx.createLinearGradient(pin.x, pin.y, pout.x, pout.y);
      fan.addColorStop(0, rgba(FROST, 0.35));
      fan.addColorStop(1, rgba(COBALT, 0.25));
      ctx.fillStyle = fan;
      ctx.beginPath();
      ctx.moveTo(pin.x, pin.y);
      ctx.lineTo(pout.x, pout.y - s * 0.12);
      ctx.lineTo(pout.x, pout.y + s * 0.12);
      ctx.closePath();
      ctx.fill();

      // ---- outgoing spectrum ----
      const cycle = reduce ? 0 : Math.floor(t / 3.2);
      const phase = reduce ? 0.5 : (t / 3.2) % 1;
      const caught = CATCHES[cycle % CATCHES.length];
      const hot = 1 + (cycle % (RAYS - 2)); // which ray refracts out warm
      const fade = Math.min(1, phase * 5, (1 - phase) * 5);
      const rays: { a: number; c: RGB; hot: boolean; end: { x: number; y: number } }[] = [];
      for (let r = 0; r < RAYS; r++) {
        const k = r / (RAYS - 1);
        const a = -0.34 + k * 0.62 + pointer.y * 0.04;
        const isHot = r === hot;
        const c = isHot ? mix(spectrum(k), caught.tone, fade) : spectrum(k);
        const len = w - pout.x + 40;
        const end = { x: pout.x + Math.cos(a) * len, y: pout.y + s * (k - 0.5) * 0.24 + Math.sin(a) * len };
        rays.push({ a, c, hot: isHot, end });
        const g = ctx.createLinearGradient(pout.x, pout.y, end.x, end.y);
        g.addColorStop(0, rgba(c, isHot ? 0.95 : 0.7));
        g.addColorStop(1, rgba(c, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = isHot ? 2 + fade * 1.5 : 1.4;
        ctx.shadowColor = rgba(c, 0.9);
        ctx.shadowBlur = isHot ? 18 * fade + 4 : 6;
        ctx.beginPath();
        ctx.moveTo(pout.x, pout.y + s * (k - 0.5) * 0.24);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }

      // particles
      ctx.shadowBlur = 0;
      for (const p of parts) {
        if (!reduce) p.t += p.v;
        if (p.t > 1) p.t = 0;
        let x: number, y: number, c: RGB, a: number;
        if (p.ray < 0 || p.ray >= RAYS) {
          x = src.x + (pin.x - src.x) * p.t;
          y = src.y + (pin.y - src.y) * p.t;
          c = FROST;
          a = 0.9 * p.t;
        } else {
          const ray = rays[p.ray];
          const k = p.ray / (RAYS - 1);
          const ox = pout.x;
          const oy = pout.y + s * (k - 0.5) * 0.24;
          x = ox + (ray.end.x - ox) * p.t * 0.85;
          y = oy + (ray.end.y - oy) * p.t * 0.85;
          c = ray.c;
          a = (1 - p.t) * (ray.hot ? 1 : 0.8);
        }
        ctx.fillStyle = rgba(c, a);
        ctx.fillRect(x - 3, y - 0.6, 6, 1.2);
      }
      ctx.restore();

      // front face of the prism on top, with an edge highlight
      const face = ctx.createLinearGradient(left.x, top.y, right.x, left.y);
      face.addColorStop(0, "rgba(32,227,206,0.10)");
      face.addColorStop(0.5, "rgba(71,123,255,0.06)");
      face.addColorStop(1, "rgba(182,108,255,0.12)");
      ctx.fillStyle = face;
      ctx.beginPath();
      tri.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      const edge = ctx.createLinearGradient(left.x, 0, right.x, 0);
      edge.addColorStop(0, rgba(GLACIER, 0.9));
      edge.addColorStop(0.5, rgba(COBALT, 0.9));
      edge.addColorStop(1, rgba(UV, 0.9));
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // ---- the catch label on the hot ray ----
      const hr = rays[hot];
      const lx = Math.min(w - 12, pout.x + (hr.end.x - pout.x) * 0.5);
      const k = hot / (RAYS - 1);
      const ly = pout.y + s * (k - 0.5) * 0.24 + (hr.end.y - pout.y) * 0.5 - 14;
      ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(caught.label).width;
      const bx = Math.min(lx - tw / 2 - 10, w - tw - 28);
      ctx.globalAlpha = fade;
      ctx.fillStyle = "rgba(8,12,24,0.88)";
      ctx.strokeStyle = rgba(caught.tone, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, ly - 13, tw + 20, 22, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(caught.tone, 1);
      ctx.fillText(caught.label, bx + 10, ly + 2);
      ctx.globalAlpha = 1;

      // source caption
      ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = rgba(FROST, 0.45);
      ctx.fillText("YOUR BILL", 14, src.y - 12);

      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && !document.hidden;
      if (visible && !was && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    const onVis = () => {
      const was = visible;
      visible = !document.hidden;
      if (visible && !was && !reduce) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
