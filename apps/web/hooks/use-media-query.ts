"use client";

import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query.
 *
 * Used to distinguish the desktop layout from the drawer layout so that
 * "toggle the inspector" means "collapse the side panel" on a wide screen and
 * "open the drawer" on a narrow one. Without this distinction the inspector
 * drawer rendered open on first paint at mobile widths and covered the chat.
 *
 * The initial value is `false` so the server-rendered markup matches the first
 * client render (no hydration mismatch); the real value is applied in an effect.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * True at the `xl` breakpoint (1280px) and above, where all three panes fit.
 *
 * The three-pane layout needs ~784px of fixed chrome (nav 240 + conversations
 * 256 + inspector 288). Enabling it at 1024px left the conversation column only
 * ~176px wide, which wrapped every heading and made the empty state unreadable.
 * Below this width the inspector becomes a drawer instead.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1280px)");
}
