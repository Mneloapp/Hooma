export default function AdminProductsLoading() {
  return (
    <div className="space-y-6" aria-label="პროდუქტების სია იტვირთება" aria-busy="true">
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse rounded bg-hooma-text/10" />
        <div className="h-10 w-56 animate-pulse rounded-xl bg-hooma-text/10" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-hooma-text/10" />
      </div>
      <div className="grid gap-3 rounded-[1.5rem] bg-white/70 p-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-hooma-text/10" />)}
      </div>
      <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="grid grid-cols-[2fr_1fr_1fr] gap-5 border-b border-hooma-text/10 px-5 py-5 last:border-0"><div className="h-4 animate-pulse rounded bg-hooma-text/10" /><div className="h-4 animate-pulse rounded bg-hooma-text/10" /><div className="h-4 animate-pulse rounded bg-hooma-text/10" /></div>)}
      </div>
    </div>
  );
}
