import type { Insight } from "@/domain/insights";
import { formatPct, formatPrice } from "@/lib/format";

const WINDOW_LABELS: Record<number, string> = {
  30: "1 mês",
  90: "3 meses",
  180: "6 meses",
  365: "1 ano",
};

interface InsightView {
  title: string;
  body: string;
  dir: "up" | "down";
}

function describe(insight: Insight): InsightView {
  switch (insight.kind) {
    case "extreme": {
      const label = WINDOW_LABELS[insight.windowDays]!;
      const low = insight.direction === "low";
      const unit = insight.crop.unit ? ` (${insight.crop.unit})` : "";
      return {
        title: `${low ? "Menor" : "Maior"} preço em ${label}`,
        body: `${insight.crop.name} fechou a R$ ${formatPrice(insight.price)}${unit}, o ${
          low ? "menor" : "maior"
        } valor em ${label}.`,
        dir: low ? "down" : "up",
      };
    }
    case "streak": {
      const up = insight.direction === "up";
      return {
        title: `${insight.length} ${up ? "altas" : "quedas"} seguidas`,
        body: `${insight.crop.name} ${up ? "subiu" : "caiu"} nos últimos ${
          insight.length
        } pregões, acumulando ${formatPct(insight.changePct)}.`,
        dir: up ? "up" : "down",
      };
    }
    case "sharp-move": {
      const up = insight.changePct >= 0;
      return {
        title: "Forte variação no dia",
        body: `${insight.crop.name} ${up ? "subiu" : "caiu"} ${formatPrice(
          Math.abs(insight.changePct),
        )}% no último pregão.`,
        dir: up ? "up" : "down",
      };
    }
  }
}

/**
 * Auto-generated headlines over the last year of history. The section
 * disappears entirely when nothing noteworthy happened — an empty "insights"
 * box would train the user to ignore it.
 */
export function InsightCards({ insights }: { insights: readonly Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <section className="mt-[26px]" aria-labelledby="destaques">
      <div className="mb-4">
        <h2 id="destaques" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Destaques
        </h2>
        <p className="mt-[3px] text-[12.5px] text-ink-soft">
          Padrões detectados automaticamente no histórico do último ano
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[14px]">
        {insights.map((insight) => {
          const view = describe(insight);
          const color = view.dir === "up" ? "var(--color-up)" : "var(--color-down)";
          const bg = view.dir === "up" ? "rgba(15,122,67,0.10)" : "rgba(192,57,43,0.10)";

          return (
            <article
              key={`${insight.crop.id}-${insight.kind}`}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-[18px]"
            >
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-[10px] py-[3px] text-[12px] font-semibold"
                style={{ color, background: bg }}
              >
                <span aria-hidden="true">{view.dir === "up" ? "▲" : "▼"}</span>
                {view.title}
              </span>
              <p className="text-[13px] leading-relaxed text-ink-muted">{view.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
