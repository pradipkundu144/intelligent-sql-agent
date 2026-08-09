const SPARKLE_PATH =
  "M12 2 L13.5 9 L20 12 L13.5 15 L12 22 L10.5 15 L4 12 L10.5 9 Z";

function Sparkle({ size, delay, className }: { size: number; delay: string; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ animationDelay: delay }}
    >
      <path d={SPARKLE_PATH} fill="currentColor" />
    </svg>
  );
}

export default function Sparkles() {
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400">
      <Sparkle size={12} delay="0ms" className="animate-[sparklePulse_1.6s_ease-in-out_infinite]" />
      <Sparkle size={8} delay="220ms" className="animate-[sparklePulse_1.6s_ease-in-out_infinite]" />
      <Sparkle size={10} delay="440ms" className="animate-[sparklePulse_1.6s_ease-in-out_infinite]" />
    </span>
  );
}
