/**
 * A static trend line. No interaction, so this stays a server component and
 * ships zero JavaScript — it is pure SVG in the HTML response.
 */
export function Sparkline({
  values,
  trend,
  height = 44,
  width = 200,
}: {
  values: readonly number[];
  trend: "up" | "down" | "flat";
  height?: number;
  width?: number;
}) {
  if (values.length < 2) {
    return <div style={{ height }} aria-hidden="true" />;
  }

  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;

  const stroke =
    trend === "up"
      ? "var(--color-up)"
      : trend === "down"
        ? "var(--color-down)"
        : "var(--color-ink-faint)";

  const points = values.map((v, i) => [
    pad + (i / (n - 1)) * (width - 2 * pad),
    pad + (1 - (v - min) / range) * (height - 2 * pad),
  ]);

  const line = `M${points.map(([x, y]) => `${x!.toFixed(1)} ${y!.toFixed(1)}`).join(" L")}`;
  const area = `${line} L ${points.at(-1)![0]!.toFixed(1)} ${height - 1} L ${points[0]![0]!.toFixed(1)} ${height - 1} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block", overflow: "visible" }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={area} fill={stroke} fillOpacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
