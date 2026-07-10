import Link from "next/link";

export interface SegmentOption {
  label: string;
  href: string;
  active: boolean;
}

/**
 * A segmented control built from links, not buttons: each option is a real URL,
 * so it works without JavaScript, middle-clicks into a new tab, and the back
 * button undoes it.
 */
export function Segmented({
  options,
  label,
}: {
  options: SegmentOption[];
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[11px] bg-segment p-[3px]"
    >
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.active ? "true" : undefined}
          className={[
            "whitespace-nowrap rounded-lg px-[13px] py-1.5 text-[12.5px] transition-all",
            o.active
              ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              : "font-medium text-ink-muted hover:text-ink",
          ].join(" ")}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
