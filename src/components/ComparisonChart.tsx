"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartSeries } from "@/domain/dashboard";
import type { Metric } from "@/lib/params";
import { formatPrice, formatShortDate, formatLongDate } from "@/lib/format";

/** Used for the first paint, before the container has been measured. */
const FALLBACK = { w: 900, h: 360 };

/** Below this the chart drops to four ticks a side and a narrower tooltip. */
const COMPACT_BELOW = 560;

/**
 * Hand-rolled rather than pulled from a chart library: the geometry is fifty
 * lines, it matches the design exactly, and it adds no bundle weight.
 *
 * The viewBox is the container's measured pixel size rather than a fixed
 * 900×360. A fixed viewBox scaled to `width: 100%` meant that on a 360px phone
 * every coordinate — including the 12px axis labels — was drawn at 0.4×, so the
 * axes came out around 5px tall and were unreadable. Measuring makes one SVG
 * unit one CSS pixel at any width, so type is the size it says it is. The
 * container is sized in CSS rather than by the SVG's aspect ratio, so the
 * measurement settling on mount does not shift the page.
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setBox({ w: rect.width, h: rect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
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

    return { n, min, max, dates };
  }, [series]);

  const viewW = box?.w ?? FALLBACK.w;
  const viewH = box?.h ?? FALLBACK.h;
  const compact = viewW < COMPACT_BELOW;

  const pad = compact
    ? { left: 44, right: 12, top: 14, bottom: 28 }
    : { left: 58, right: 20, top: 18, bottom: 34 };
  const plotW = Math.max(1, viewW - pad.left - pad.right);
  const plotH = Math.max(1, viewH - pad.top - pad.bottom);
  const yTicks = compact ? 4 : 5;
  const xTicks = compact ? 4 : 6;

  // The fallbacks are only ever read when `data` is null, in which case the
  // empty state renders and none of the geometry below reaches the DOM. They
  // exist so the scales can be plain expressions rather than nullable ones.
  const { n, min, max, dates } = data ?? { n: 2, min: 0, max: 1, dates: [] };
  const x = (i: number) => pad.left + (i / (n - 1)) * plotW;
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * plotH;

  // A tight price window — a single crop over 30 days — puts several ticks
  // inside the same real, and whole-real labels then repeat down the axis as
  // "65, 65". One decimal appears only when the step is small enough to need
  // it, so wide windows keep the cleaner integers.
  const yStep = (max - min) / yTicks;
  const fmtY = (v: number) =>
    metric === "pct"
      ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`
      : formatPrice(v, yStep < 2 ? 1 : 0);
  const fmtV = (v: number) =>
    metric === "pct" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : `R$ ${formatPrice(v)}`;

  const hoverDate = hover !== null ? dates[hover] : undefined;
  const tooltipRows =
    hover === null
      ? []
      : series
          .map((s) => ({ s, v: s.values[hover] }))
          .filter((r): r is { s: ChartSeries; v: number } => r.v !== undefined);

  // Name and value share a line on desktop. On a phone there is no width for
  // that — "Café arábica" against "R$ 1.746,47" overruns any tooltip narrow
  // enough to fit a 324px chart — so the value moves under the name. Vertical
  // room inside the tooltip is the cheaper of the two here, and stacking is
  // immune to long crop names and to the wider `brl` values alike.
  const stacked = compact;
  const rowH = stacked ? 32 : 20;
  const tipW = stacked ? 150 : 196;
  const tipH = (stacked ? 28 : 30) + tooltipRows.length * rowH;
  const hx = hover === null ? 0 : x(hover);
  const tipX = Math.min(
    Math.max(hx + 12 + tipW > viewW ? hx - 12 - tipW : hx + 12, 4),
    Math.max(4, viewW - tipW - 4),
  );
  const tipY = Math.max(4, Math.min(pad.top + 6, viewH - tipH - 4));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * viewW;
    const frac = (relX - pad.left) / plotW;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  }

  // Touch sends no hover, so a tap has to open the tooltip and a drag has to
  // scrub it. Capturing the pointer keeps the drag alive once it leaves the hit
  // rect, and `touch-action: pan-y` on the SVG means a vertical swipe still
  // scrolls the page instead of being swallowed by the chart — the previous
  // `touch-action: none` trapped the scroll anywhere over the plot.
  function onDown(e: React.PointerEvent<SVGRectElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    onMove(e);
  }

  // Only a mouse leaving the plot means "done reading". A touch pointer stops
  // existing the moment the finger lifts, so Chromium fires pointerleave right
  // behind pointerup — clearing on that wiped the tooltip out on every tap,
  // before it could be read. On touch it stays until the next tap moves it.
  function onLeave(e: React.PointerEvent<SVGRectElement>) {
    if (e.pointerType === "mouse") setHover(null);
  }

  return (
    <figure className="m-0">
      <div ref={boxRef} className="h-[260px] w-full sm:h-[360px]">
        {data === null ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink-faint">
            {series.length === 0
              ? "Selecione ao menos uma cultura acima."
              : "Histórico insuficiente para o período escolhido."}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              touchAction: "pan-y",
            }}
            aria-hidden="true"
            focusable="false"
          >
            {Array.from({ length: yTicks + 1 }, (_, t) => {
              const v = min + ((max - min) * t) / yTicks;
              const yy = y(v);
              return (
                <g key={`y${t}`}>
                  <line x1={pad.left} x2={viewW - pad.right} y1={yy} y2={yy} stroke="#00000010" />
                  <text
                    x={pad.left - 8}
                    y={yy + 4}
                    textAnchor="end"
                    fontSize={compact ? 11 : 12}
                    fill="var(--color-ink-faint)"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtY(v)}
                  </text>
                </g>
              );
            })}

            {Array.from({ length: Math.min(xTicks, n) }, (_, t) => {
              const count = Math.min(xTicks, n);
              const i = count <= 1 ? 0 : Math.round((t / (count - 1)) * (n - 1));
              const d = dates[i];
              if (!d) return null;
              // The outer two labels sit on the plot edges, so centring them
              // hangs half the text outside the viewBox and it gets clipped.
              // Anchor them inward instead; the middle ones stay centred.
              const anchor = t === 0 ? "start" : t === count - 1 ? "end" : "middle";
              return (
                <text
                  key={`x${t}`}
                  x={x(i)}
                  y={viewH - 10}
                  textAnchor={anchor}
                  fontSize={compact ? 10.5 : 11.5}
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
                strokeWidth={compact ? 1.9 : 2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {hover !== null && (
              <g>
                <line
                  x1={hx}
                  x2={hx}
                  y1={pad.top}
                  y2={viewH - pad.bottom}
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
                <rect
                  x={tipX}
                  y={tipY}
                  width={tipW}
                  height={tipH}
                  rx={9}
                  fill="#17140F"
                  opacity={0.97}
                />
                <text
                  x={tipX + 13}
                  y={tipY + 19}
                  fontSize={11.5}
                  fill="#b8b2a8"
                  fontFamily="var(--font-mono)"
                >
                  {hoverDate ? formatLongDate(hoverDate) : ""}
                </text>
                {tooltipRows.map(({ s, v }, k) => {
                  const yy = tipY + (stacked ? 38 : 40) + k * rowH;
                  return (
                    <g key={s.cropId}>
                      <circle cx={tipX + 17} cy={yy - 4} r={4} fill={s.colorHex} />
                      <text x={tipX + 27} y={yy} fontSize={12.5} fill="#fff">
                        {s.name}
                      </text>
                      <text
                        x={stacked ? tipX + 27 : tipX + tipW - 12}
                        y={stacked ? yy + 15 : yy}
                        textAnchor={stacked ? "start" : "end"}
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
              x={pad.left}
              y={pad.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerLeave={onLeave}
            />
          </svg>
        )}
      </div>

      {data !== null && (
        <p className="mt-2 text-center text-[11.5px] text-ink-faint sm:hidden">
          Toque e arraste no gráfico para ver os valores de cada dia.
        </p>
      )}

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
