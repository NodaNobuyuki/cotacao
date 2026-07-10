import Link from "next/link";
import type { CropMeta } from "@/domain/types";
import { buildHref, toggleCrop, type DashboardParams } from "@/lib/params";

/**
 * Toggles which crops appear on the comparison chart.
 *
 * `aria-pressed` carries the on/off state; colour alone would leave it
 * invisible to screen readers and ambiguous to colourblind users.
 */
export function CropChips({
  crops,
  params,
}: {
  crops: readonly CropMeta[];
  params: DashboardParams;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {crops.map((c) => {
        const on = params.selected.includes(c.id);
        const href = buildHref(params, { selected: toggleCrop(params.selected, c.id) });
        return (
          <Link
            key={c.id}
            href={href}
            scroll={false}
            aria-pressed={on}
            role="button"
            className={[
              "inline-flex items-center gap-[7px] rounded-full border px-[13px] py-1.5 text-[12.5px] transition-all",
              on
                ? "border-current bg-surface font-semibold text-ink opacity-100"
                : "border-line-input bg-transparent font-medium text-ink-faint opacity-65 hover:opacity-90",
            ].join(" ")}
            style={on ? { borderColor: c.colorHex } : undefined}
          >
            <span
              aria-hidden="true"
              className="size-[9px] shrink-0 rounded-[2px]"
              style={{ background: c.colorHex }}
            />
            {c.name}
          </Link>
        );
      })}
    </div>
  );
}
