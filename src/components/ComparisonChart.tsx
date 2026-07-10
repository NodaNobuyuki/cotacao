"use client";

import { useMemo, useState } from "react";
import type { ChartSeries } from "@/domain/dashboard";
import type { Metric } from "@/lib/params";
import { formatPrice, formatShortDate, formatLongDate } from "@/lib/format";

const VIEW_W = 900;
const VIEW_H = 360;
const PAD = { left: 58, right: 20, top: 18, bottom: 34 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const Y_TICKS = 5;
const X_TICKS = 6;

/**
 * Hand-rolled rather than pulled from a chart library: the geometry is fifty
 * lines, it matches the design exactly, and it adds no bundle weight.
 *
 * The SVG is marked aria-hidden and paired with a visually-hidden table, so
 * screen reader users get the numbers instead of an unlabelled graphic.
 */
export function ComparisonChart({
  series,
  metric,
}: {
  series: ChartSeries[];
  metric: Metric;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (series.length === 0) return null;

    const n = Math.max(...series.map((s) => s.values.length));
    if (n < 2) return null;

    const all = series.flatMap((s) => s.values as number[]);
    let min = Math.min(...all);
    let max = Math.max(...all);
    const pad = (max - min) * 0.1 || 1;
    min -= pad;
    max += pad;

    // The longest series defines the x-axis; all share the same window.
    const dates = series.reduce<readonly string[]>(
      (longest, s) => (s.dates.length > longest.length ? s.dates : longest),
      [],
    );

    const x = (i: number) => PAD.left + (i / (n - 1)) * PLOT_W;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * PLOT_H;

    return { n, min, max, dates, x, y };
  }, [series]);

  if (!model) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-ink-faint">
        {series.length === 0
          ? "Selecione ao menos uma cultura acima."
          : "Histórico insuficiente para o período escolhido."}
      </div>
    );
  }

  const { n, min, max, dates, x, y } = model;
  const fmtY = (v: number) =>
    metric === "pct" ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : formatPrice(v, 0);
  const fmtV = (v: number) =>
    metric === "pct" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : `R$ ${formatPrice(v)}`;

  const hoverDate = hover !== null ? dates[hover] : undefined;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const frac = (relX - PAD.left) / PLOT_W;
    const i = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHover(i);
  }

  const tooltipRows =
    hover === null
      ? []
      : series
          .map((s) => ({ s, v: s.values[hover] }))
          .filter((r): r is { s: ChartSeries; v: number } => r.v !== undefined);

  const tipW = 196;
  const tipH = 30 + tooltipRows.length * 20;
  const hx = hover === null ? 0 : x(hover);
  const tipX = hx + 12 + tipW > VIEW_W ? hx - 12 - tipW : hx + 12;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
        aria-hidden="true"
        focusable="false"
      >
        {Array.from({ length: Y_TICKS + 1 }, (_, t) => {
          const v = min + ((max - min) * t) / Y_TICKS;
          const yy = y(v);
          return (
            <g key={`y${t}`}>
              <line x1={PAD.left} x2={VIEW_W - PAD.right} y1={yy} y2={yy} stroke="#00000010" />
              <text
                x={PAD.left - 8}
                y={yy + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--color-ink-faint)"
                fontFamily="var(--font-mono)"
              >
                {fmtY(v)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: Math.min(X_TICKS, n) }, (_, t) => {
          const count = Math.min(X_TICKS, n);
          const i = count <= 1 ? 0 : Math.round((t / (count - 1)) * (n - 1));
          const d = dates[i];
          if (!d) return null;
          return (
            <text
              key={`x${t}`}
              x={x(i)}
              y={VIEW_H - 12}
              textAnchor="middle"
              fontSize={11.5}
              fill="var(--color-ink-faint)"
              fontFamily="var(--font-mono)"
            >
              {formatShortDate(d)}
            </text>
          );
        })}

        {series.map((s) => (
          <path
            key={s.cropId}
            d={`M${s.values.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" L")}`}
            fill="none"
            stroke={s.colorHex}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hover !== null && (
          <g>
            <line
              x1={hx}
              x2={hx}
              y1={PAD.top}
              y2={VIEW_H - PAD.bottom}
              stroke="#00000030"
              strokeDasharray="3 3"
            />
            {tooltipRows.map(({ s, v }) => (
              <circle
                key={s.cropId}
                cx={hx}
                cy={y(v)}
                r={3.5}
                fill="#fff"
                stroke={s.colorHex}
                strokeWidth={2}
              />
            ))}
            <rect x={tipX} y={PAD.top + 6} width={tipW} height={tipH} rx={9} fill="#17140F" opacity={0.97} />
            <text
              x={tipX + 13}
              y={PAD.top + 25}
              fontSize={11.5}
              fill="#b8b2a8"
              fontFamily="var(--font-mono)"
            >
              {hoverDate ? formatLongDate(hoverDate) : ""}
            </text>
            {tooltipRows.map(({ s, v }, k) => {
              const yy = PAD.top + 46 + k * 20;
              return (
                <g key={s.cropId}>
                  <circle cx={tipX + 17} cy={yy - 4} r={4} fill={s.colorHex} />
                  <text x={tipX + 27} y={yy} fontSize={12.5} fill="#fff">
                    {s.name}
                  </text>
                  <text
                    x={tipX + tipW - 12}
                    y={yy}
                    textAnchor="end"
                    fontSize={12.5}
                    fontWeight={600}
                    fill="#fff"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtV(v)}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      <figcaption className="sr-only">
        <table>
          <caption>
            Comparativo de preços por cultura,{" "}
            {metric === "pct" ? "variação percentual no período" : "preço absoluto em reais"}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              {series.map((s) => (
                <th key={s.cropId} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((d, i) => (
              <tr key={d}>
                <th scope="row">{formatLongDate(d)}</th>
                {series.map((s) => (
                  <td key={s.cropId}>
                    {s.values[i] !== undefined ? fmtV(s.values[i]!) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
