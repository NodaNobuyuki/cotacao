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

function sortLabel(dir: "asc" | "desc"): string {
  return dir === "asc" ? "crescente" : "decrescente";
}

/**
 * The prototype sorted via `onClick` on bare `<th>` elements: unreachable by
 * keyboard and silent to assistive tech. Here each header is a link that
 * rewrites the sort params, and `aria-sort` announces the current order.
 *
 * Below `sm` the same data renders as a list of cards instead. Seven columns of
 * `whitespace-nowrap` cells inside `overflow-x-auto` meant a phone showed
 * "Cultura" and half of "Preço", with no affordance saying the rest was
 * sideways. Only one of the two renders at a time — the hidden branch is
 * `display: none`, so it is out of the accessibility tree as well.
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
    <>
      <MobileList snapshots={snapshots} params={params} regionName={regionName} />

      <div className="hidden overflow-x-auto sm:block">
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
    </>
  );
}

/**
 * The card list, plus the sort control the discarded table header would have
 * provided. The praça column is dropped: it is the same value on every row and
 * already names itself in the select at the top of the page, so on a narrow
 * screen it is pure repetition.
 */
function MobileList({
  snapshots,
  params,
  regionName,
}: {
  snapshots: CropSnapshot[];
  params: DashboardParams;
  regionName: string;
}) {
  return (
    <div className="sm:hidden">
      <div
        role="group"
        aria-label="Ordenar culturas"
        className="flex gap-1.5 overflow-x-auto px-4 pb-3.5"
      >
        {COLUMNS.map((col) => {
          const active = params.sortKey === col.key;
          return (
            <Link
              key={col.key}
              href={buildHref(params, nextSort(params, col.key))}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={[
                "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[12.5px] transition-colors",
                active
                  ? "border-ink bg-ink font-semibold text-white"
                  : "border-line-input font-medium text-ink-muted",
              ].join(" ")}
            >
              {col.label}
              {active && (
                <>
                  <span aria-hidden="true">{params.sortDir === "asc" ? "↑" : "↓"}</span>
                  <span className="sr-only">, ordem {sortLabel(params.sortDir)}</span>
                </>
              )}
            </Link>
          );
        })}
      </div>

      <ul
        aria-label={`Preços e variações por cultura na praça de ${regionName}`}
        className="border-t border-line"
      >
        {snapshots.map((s) => (
          <li key={s.crop.id} className="border-b border-line-soft px-4 py-3.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-[9px] shrink-0 rounded-[2px]"
                  style={{ background: s.crop.colorHex }}
                />
                <b className="truncate text-[14.5px] font-semibold text-ink">
                  {s.crop.name}
                </b>
              </span>
              <span className="shrink-0 font-mono text-[15px] font-semibold text-ink">
                R$ {formatPrice(s.price)}
              </span>
            </div>

            <div className="mt-px flex items-baseline justify-between gap-3 text-[11px] text-ink-faint">
              <span className="truncate pl-[17px]">{s.crop.unit}</span>
              <span className="shrink-0 font-mono">{formatShortDate(s.date)}</span>
            </div>

            <dl className="mt-2.5 grid grid-cols-3 gap-2">
              {(
                [
                  ["Dia", s.variation.day],
                  ["Semana", s.variation.week],
                  ["Mês", s.variation.month],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-[9px] bg-surface-muted px-2.5 py-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                    {label}
                  </dt>
                  <dd
                    className="mt-px font-mono text-[13px] font-semibold"
                    style={{ color: deltaColor(value) }}
                  >
                    {formatPct(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
