import Logo from "./Logo";

export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="flex w-full items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">
            Intelligent SQL Agent
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgb(34_197_94/0.7)]" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            shop_db
          </span>
        </div>
      </div>
    </header>
  );
}
