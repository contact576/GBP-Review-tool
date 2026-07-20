export function RouteLoading() {
  return (
    <main id="main" className="mx-auto w-full max-w-[1400px] animate-pulse px-4 py-8 lg:px-8" aria-busy="true" aria-label="Loading page">
      <div className="h-8 w-64 rounded-btn bg-hairline" />
      <div className="mt-3 h-4 w-96 max-w-full rounded-btn bg-hairline/70" />
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        <div className="h-52 rounded-card bg-hairline/70 lg:col-span-2" />
        <div className="h-52 rounded-card bg-hairline/70" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 rounded-card bg-hairline/70" />
        ))}
      </div>
      <span className="sr-only">Loading Foundly</span>
    </main>
  );
}
