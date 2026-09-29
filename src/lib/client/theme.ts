"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const getSnapshot = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerSnapshot = (): Theme => "light";

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("qs:theme", t);
    } catch {}
  }, []);
  return { theme, setTheme };
}

/** Follow OS light/dark changes until the user picks a theme explicitly. */
export function useSystemThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (localStorage.getItem("qs:theme")) return;
      } catch {}
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
}

/** Current token values, for canvas/SVG charts that can't use CSS classes. */
export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    up: v("--up"),
    down: v("--down"),
    accent: v("--accent"),
    warn: v("--warn"),
    ink: v("--ink"),
    muted: v("--muted"),
    faint: v("--faint"),
    line: v("--line"),
    lineStrong: v("--line-strong"),
    surface: v("--surface"),
    subtle: v("--subtle"),
    bg: v("--bg"),
  };
}

export function alpha(hex: string, a: number) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
