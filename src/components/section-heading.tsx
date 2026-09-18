import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>{eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}<h1 className="text-4xl font-semibold tracking-[-0.045em]">{title}</h1></div>
      {action}
    </div>
  );
}
