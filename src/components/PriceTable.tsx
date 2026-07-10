import Link from "next/link";
import type { CropSnapshot } from "@/domain/dashboard";
import { formatPct, formatPrice, formatShortDate, trendDirection } from "@/lib/format";
import { buildHref, nextSort, type DashboardParams, type SortKey } from "@/lib/params";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "nome", label: "Cultura", numeric: false },
  { key: "preco", label: "Preço", numeric: true },
  { key: "dia", label: "Dia", numeric: true },
  { key: "semana", label: "Semana", numeric: true },
  { key: "mes", label: "Mês", numeric: true },
];

function deltaColor(value: number | undefined): string {
  const d = trendDirection(value);
  return d === "up"
    ? "var(--color-up)"
    : d === "down"
      ? "var(--color-down)"
      : "var(--color-ink-faint)";
}

/**
 * The prototype sorted via `onClick` on bare `<th>` elements: unreachable by
 * keyboard and silent to assistive tech. Here each header is a link that
 * rewrites the sort params, and `aria-sort` announces the current order.
 */
export function PriceTable({
  snapshots,
  params,
  regionName,
}: {
  snapshots: CropSnapshot[];
  params: DashboardParams;
  regionName: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">
        <caption className="sr-only">
          Preços e variações por cultura na praça de {regionName}.
        </caption>
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map((col) => {
              const active = params.sortKey === col.key;
              const ariaSort = active
                ? params.sortDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none";
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`whitespace-nowrap px-4 py-[11px] ${col.numeric ? "text-right" : "text-left"}`}
                >
                  <Link
                    href={buildHref(params, nextSort(params, col.key))}
                    scroll={false}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-soft hover:text-ink"
                  >
                    {col.label}
                    <span aria-hidden="true">
                      {active ? (params.sortDir === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </Link>
                </th>
              );
            })}
            <th
              scope="col"
              className="whitespace-nowrap px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-soft"
            >
              Praça
            </th>
            <th
              scope="col"
              className="whitespace-nowrap px-4 py-[11px] text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-soft"
            >
              Cotação
            </th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.crop.id} className="border-b border-line-soft">
              <td className="px-4 py-[13px]">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-[9px] rounded-[2px]"
                    style={{ background: s.crop.colorHex }}
                  />
                  <b className="font-semibold text-ink">{s.crop.name}</b>
                </span>
                <div className="pl-[17px] text-[11px] text-ink-faint">{s.crop.unit}</div>
              </td>
              <td className="whitespace-nowrap px-4 py-[13px] text-right font-mono font-semibold text-ink">
                R$ {formatPrice(s.price)}
              </td>
              {([s.variation.day, s.variation.week, s.variation.month] as const).map(
                (v, i) => (
                  <td
                    key={i}
                    className="whitespace-nowrap px-4 py-[13px] text-right font-mono font-semibold"
                    style={{ color: deltaColor(v) }}
                  >
                    {formatPct(v)}
                  </td>
                ),
              )}
              <td className="whitespace-nowrap px-4 py-[13px] text-ink-muted">{regionName}</td>
              <td className="whitespace-nowrap px-4 py-[13px] text-right font-mono text-ink-faint">
                {formatShortDate(s.date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
