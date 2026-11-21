import { type ReactNode } from 'react';

type SandboxSectionProps = {
  /** Unique within the page. It links the heading to the section. */
  id: string;
  title: string;
  children: ReactNode;
};

/** One group of the gallery: a heading and its demos, flat on the page (the gallery draws the dividers). */
export function SandboxSection({ id, title, children }: SandboxSectionProps) {
  return (
    <section aria-labelledby={`sandbox-${id}`} className="space-y-8 py-8 first:pt-0 last:pb-0">
      <h2 id={`sandbox-${id}`} className="font-serif text-xl font-medium text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

type SandboxDemoProps = {
  label: string;
  children: ReactNode;
};

/** One labelled example inside a section. */
export function SandboxDemo({ label, children }: SandboxDemoProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</h3>
      {children}
    </div>
  );
}
