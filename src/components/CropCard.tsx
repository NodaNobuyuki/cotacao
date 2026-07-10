import type { CropSnapshot } from "@/domain/dashboard";
import { formatPct, formatPrice, trendArrow, trendDirection } from "@/lib/format";
import { Sparkline } from "./Sparkline";

/** The colour pair for a movement. Arrow and sign carry the same information,
 *  so the meaning survives a colourblind reader or a black-and-white print. */
export function DeltaPill({ value }: { value: number | undefined }) {
  const dir = trendDirection(value);
  const color =
    dir === "up" ? "var(--color-up)" : dir === "down" ? "var(--color-down)" : "var(--color-ink-faint)";
  const bg =
    dir === "up"
      ? "rgba(15,122,67,0.10)"
      : dir === "down"
        ? "rgba(192,57,43,0.10)"
        : "rgba(160,154,144,0.10)";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] font-mono text-[13px] font-semibold"
      style={{ color, background: bg }}
    >
      <span aria-hidden="true">{trendArrow(value)}</span>
      {formatPct(value)}
    </span>
  );
}

export function CropCard({ snapshot }: { snapshot: CropSnapshot }) {
  const { crop, price, variation, spark } = snapshot;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-[18px]">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-ink">{crop.name}</h3>
          <p className="mt-px whitespace-nowrap text-[11.5px] text-ink-faint">{crop.unit}</p>
        </div>
        <span
          aria-hidden="true"
          className="mt-[3px] size-[11px] shrink-0 rounded-[3px]"
          style={{ background: crop.colorHex }}
        />
      </div>

      <p className="text-[31px] font-semibold leading-none tracking-[-0.02em] text-ink">
        <span className="mr-[3px] text-[15px] font-medium text-ink-faint">R$</span>
        {formatPrice(price)}
      </p>

      <div className="flex items-center justify-between">
        <DeltaPill value={variation.day} />
        <span className="text-[11px] text-ink-faint">7 dias</span>
      </div>

      <Sparkline values={spark} trend={trendDirection(variation.day)} />
    </article>
  );
}
