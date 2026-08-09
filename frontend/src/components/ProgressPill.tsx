import { useEffect, useState } from "react";
import StageProgress, { type StageStatus } from "./StageProgress";

type Props = {
  stages: Record<string, { status: StageStatus; durationMs?: number }>;
  done: boolean;
};

export default function ProgressPill({ stages, done }: Props) {
  const [entered, setEntered] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!done) {
      setHidden(false);
      return;
    }
    const t = setTimeout(() => setHidden(true), 900);
    return () => clearTimeout(t);
  }, [done]);

  const active = entered && !hidden;

  return (
    <div
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "translateX(0)" : "translateX(20px)",
        transition: hidden
          ? "opacity 500ms ease-out, transform 500ms ease-out"
          : "opacity 300ms ease-out, transform 300ms ease-out",
      }}
      className={`w-max rounded-md border border-slate-800 bg-slate-950/90 px-3 py-2.5 shadow-lg backdrop-blur-md ${
        hidden ? "pointer-events-none" : ""
      }`}
    >
      <StageProgress stages={stages} />
    </div>
  );
}
