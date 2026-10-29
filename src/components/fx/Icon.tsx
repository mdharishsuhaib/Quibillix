import type { SVGProps } from "react";

/** Hand-tuned 24px stroke icons (no icon dependency). */
const PATHS = {
  upload: "M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  pdf: "M7 3h7l5 5v13H7zM14 3v5h5M9.5 13h5M9.5 16.5h5",
  pulse: "M3 12h4l2.5-6 5 12 2.5-6h4",
  hospital: "M4 21V7l8-4 8 4v14M10 21v-5h4v5M12 8v5M9.5 10.5h5",
  phone: "M8 3h8v18H8zM11 18h2",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  copy: "M8 8h11v12H8zM5 16V4h11",
  download: "M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14",
  check: "M5 12.5 10 17.5 19 7",
  x: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14m0 0-5-5m5 5-5 5",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z",
  doc: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  folder: "M3 7h6l2 2h10v10H3z",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  keyboard: "M3 7h18v10H3zM7 14h10M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
