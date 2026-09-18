import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 px-1">
      <div>{eyebrow ? <p className="mb-2 text-[0.7rem] font-medium text-[var(--muted)]">{eyebrow}</p> : null}<h1 className="text-[2rem] font-bold tracking-[-0.05em] sm:text-4xl">{title}</h1></div>
      {action}
    </div>
  );
}
