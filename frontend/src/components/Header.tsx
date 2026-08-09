export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <h1 className="text-base font-semibold tracking-tight text-slate-900">
          Intelligent SQL Agent
        </h1>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          connected: shop_db
        </span>
      </div>
    </header>
  );
}
