const cards = [0, 1, 2];

export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando sección" className="animate-pulse">
      <div className="mb-8 px-1">
        <div className="h-3 w-24 rounded-full bg-black/8" />
        <div className="mt-3 h-9 w-40 rounded-xl bg-black/10" />
      </div>
      <div className="space-y-4">
        {cards.map((card) => (
          <div className="card p-6" key={card}>
            <div className="h-3 w-20 rounded-full bg-black/8" />
            <div className="mt-4 h-7 w-2/3 rounded-lg bg-black/10" />
            <div className="mt-3 h-3 w-1/2 rounded-full bg-black/8" />
            <div className="mt-7 h-12 w-full rounded-full bg-black/8" />
          </div>
        ))}
      </div>
    </main>
  );
}
