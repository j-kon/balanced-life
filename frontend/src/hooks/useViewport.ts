import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsStandalonePwa(): boolean {
  const standaloneMedia = useMediaQuery(
    "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)",
  );
  const iosStandalone =
    typeof window !== "undefined" &&
    Boolean((window.navigator as { standalone?: boolean }).standalone);
  return standaloneMedia || iosStandalone;
}

export function useIsCompactViewport(): boolean {
  return useMediaQuery("(max-width: 768px)");
}

/**
 * Detects an active mobile soft keyboard using the VisualViewport API combined
 * with active form field focus so fixed bottom navigation never floats over typing areas.
 */
export function useVirtualKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const evaluate = () => {
      const active = document.activeElement;
      const isEditable = Boolean(
        active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT" ||
            (active as HTMLElement).isContentEditable),
      );
      const heightReduced = window.innerHeight - vv.height > 140;
      setOpen(isEditable && heightReduced);
    };

    vv.addEventListener("resize", evaluate);
    document.addEventListener("focusin", evaluate);
    document.addEventListener("focusout", evaluate);
    return () => {
      vv.removeEventListener("resize", evaluate);
      document.removeEventListener("focusin", evaluate);
      document.removeEventListener("focusout", evaluate);
    };
  }, []);

  return open;
}

