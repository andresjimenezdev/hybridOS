type Point = { label: string; value: number };

export function TrendChart({ points, label = "Evolución", unit = "" }: { points: Point[]; label?: string; unit?: string }) {
  if (points.length < 2) return <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]">Se necesitan al menos dos registros.</div>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: 8 + (index / (points.length - 1)) * 84,
    y: 82 - ((point.value - min) / range) * 64,
  }));
  return (
    <div><svg aria-label={label} className="h-44 w-full overflow-visible" role="img" viewBox="0 0 100 100"><path d={`M ${coordinates.map((point) => `${point.x} ${point.y}`).join(" L ")}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />{coordinates.map((point) => <circle cx={point.x} cy={point.y} fill="var(--background)" key={`${point.label}-${point.x}`} r="2.5" stroke="currentColor" strokeWidth="1.5"><title>{point.label}: {point.value}{unit ? ` ${unit}` : ""}</title></circle>)}</svg><div className="flex justify-between text-xs text-[var(--muted)]"><span>{points[0]?.label}</span><span>{points.at(-1)?.label}</span></div></div>
  );
}
