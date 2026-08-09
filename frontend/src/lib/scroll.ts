const EASE_OUT_EXPO = (t: number): number => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

export function smoothScrollTo(
  el: HTMLElement,
  targetY: number,
  durationMs = 250,
): () => void {
  const startY = el.scrollTop;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) return () => {};

  const startTime = performance.now();
  let rafId = 0;
  let cancelled = false;

  const onUserScroll = () => {
    cancelled = true;
    cleanup();
  };
  const cleanup = () => {
    el.removeEventListener("wheel", onUserScroll, { passive: true } as EventListenerOptions);
    el.removeEventListener("touchmove", onUserScroll, { passive: true } as EventListenerOptions);
    cancelAnimationFrame(rafId);
  };
  el.addEventListener("wheel", onUserScroll, { passive: true });
  el.addEventListener("touchmove", onUserScroll, { passive: true });

  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startTime) / durationMs);
    el.scrollTop = startY + delta * EASE_OUT_EXPO(t);
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      cleanup();
    }
  };
  rafId = requestAnimationFrame(step);

  return cleanup;
}
