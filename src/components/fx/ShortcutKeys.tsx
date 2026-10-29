"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const kbd = "rounded-[3px] bg-raised px-1.5 py-0.5 text-xs text-frost";

/** "Ctrl + Enter" on Windows/Linux, "⌘ + Enter" on Apple devices. */
export default function ShortcutKeys() {
  const mac = useSyncExternalStore(noop, () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent), () => false);
  return (
    <span className="whitespace-nowrap">
      <kbd className={kbd}>{mac ? "⌘" : "Ctrl"}</kbd> + <kbd className={kbd}>Enter</kbd>
    </span>
  );
}
