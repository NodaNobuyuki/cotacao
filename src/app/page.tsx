import { ComparisonChart } from "@/components/ComparisonChart";
import { CropCard } from "@/components/CropCard";
import { CropChips } from "@/components/CropChips";
import { DataBanner } from "@/components/DataBanner";
import { EmptyState } from "@/components/EmptyState";
import { InsightCards } from "@/components/InsightCards";
import { PriceTable } from "@/components/PriceTable";
import { RegionSelect } from "@/components/RegionSelect";
import { Segmented } from "@/components/Segmented";
import { SellSimulator } from "@/components/SellSimulator";
import { SourceFooter } from "@/components/SourceFooter";
import {
  latestQuoteDate,
  listCrops,
  listRegions,
  seriesByCrop,
  sourcesForRegion,
} from "@/db/queries";
import { buildChartSeries, buildSnapshots, sortSnapshots } from "@/domain/dashboard";
import { buildInsights } from "@/domain/insights";
import { formatLongDate } from "@/lib/format";
import {
  buildCropHref,
  buildHref,
  METRICS,
  parseDashboardParams,
  PERIODS,
  type SearchParams,
} from "@/lib/params";

// Prices change once a day; there is no reason to hit the database on every
// request. Revalidation is short enough that a fresh ingest surfaces quickly.
export const revalidate = 300;

const PERIOD_LABELS: Record<number, string> = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
  365: "1 ano",
};

const METRIC_LABELS: Record<string, string> = {
  pct: "Variação %",
  brl: "R$ absoluto",
};

const METRIC_HINTS: Record<string, string> = {
  pct: "Variação percentual desde o início do período — melhor para comparar culturas de preços muito diferentes, como café e milho.",
  brl: "Preço absoluto em reais. As escalas entre culturas divergem bastante.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const [regions, crops] = await Promise.all([listRegions(), listCrops()]);

  if (regions.length === 0 || crops.length === 0) {
    return <EmptyState />;
  }

  const regionIds = regions.map((r) => r.id);
  const requested = parseDashboardParams(sp, regionIds, crops.map((c) => c.id));

  // Insights read a fixed one-year window rather than the UI period, so
  // "lowest in 3 months" does not appear and vanish as the user toggles the
  // chart between 7 and 90 days.
  const [series, yearSeries, latestDate, sources] = await Promise.all([
    seriesByCrop(requested.region, requested.period),
    seriesByCrop(requested.region, 365),
    latestQuoteDate(requested.region),
    sourcesForRegion(requested.region),
  ]);

  // CEPEA does not publish every crop in every praça — there is no trigo
  // indicator for São Paulo, nor café for Paraná. Chips and selections are
  // therefore scoped to what this praça actually has, so no control on screen
  // is a dead toggle that silently plots nothing.
  const cropsHere = crops.filter((c) => (series.get(c.id)?.length ?? 0) > 0);
  const params = parseDashboardParams(
    sp,
    regionIds,
    cropsHere.map((c) => c.id),
  );

  const snapshots = buildSnapshots(cropsHere, series);
  const insights = buildInsights(cropsHere, yearSeries);
  const sorted = sortSnapshots(snapshots, params.sortKey, params.sortDir);
  const chartSeries = buildChartSeries(
    cropsHere,
    series,
    params.selected,
    params.period,
    params.metric,
  );

  const regionName = regions.find((r) => r.id === params.region)?.name ?? params.region;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-line bg-canvas/85 px-4 py-[13px] backdrop-blur-md sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-[11px] bg-ink font-mono text-lg font-bold text-white"
          >
            ◈
          </div>
          <div>
            <p className="text-[16.5px] font-semibold tracking-[-0.01em] text-ink">
              AnalAgro
            </p>
            <p className="text-xs text-ink-soft">Indicador diário por praça</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[18px]">
          <div className="text-right leading-[1.35]">
            <p className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
              Última cotação
            </p>
            <p className="font-mono text-[13px] font-medium text-ink">
              {latestDate ? formatLongDate(latestDate) : "—"}
            </p>
          </div>
          <RegionSelect regions={regions} params={params} />
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-[1240px] px-4 pb-16 pt-5 sm:px-6 lg:px-10">
        <DataBanner sources={sources} latestDate={latestDate} />

        <section className="mt-6" aria-labelledby="panorama">
          <div className="mb-4">
            <h2 id="panorama" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
              Panorama de hoje
            </h2>
            <p className="mt-[3px] text-[12.5px] text-ink-soft">
              Fechamento mais recente em {regionName}
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(214px,1fr))] gap-[14px]">
            {snapshots.map((s) => (
              <CropCard key={s.crop.id} snapshot={s} href={buildCropHref(s.crop.id, params)} />
            ))}
          </div>
        </section>

        <InsightCards insights={insights} />

        <section
          className="mt-[26px] rounded-[18px] border border-line bg-surface p-4 sm:p-6"
          aria-labelledby="comparativo"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-[14px]">
            <div className="max-w-[520px]">
              <h2 id="comparativo" className="text-base font-semibold text-ink">
                Comparativo de preços
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-soft">{METRIC_HINTS[params.metric]}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2.5">
              <Segmented
                label="Métrica do eixo vertical"
                options={METRICS.map((m) => ({
                  label: METRIC_LABELS[m]!,
                  href: buildHref(params, { metric: m }),
                  active: params.metric === m,
                }))}
              />
              <Segmented
                label="Período exibido"
                options={PERIODS.map((p) => ({
                  label: PERIOD_LABELS[p]!,
                  href: buildHref(params, { period: p }),
                  active: params.period === p,
                }))}
              />
            </div>
          </div>

          <CropChips crops={cropsHere} params={params} />
          <ComparisonChart series={chartSeries} metric={params.metric} />
        </section>

        <section
          className="mt-[26px] overflow-hidden rounded-[18px] border border-line bg-surface"
          aria-labelledby="detalhamento"
        >
          <div className="px-5 pb-3 pt-[18px]">
            <h2 id="detalhamento" className="text-base font-semibold text-ink">
              Detalhamento por cultura
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-soft">
              Ordene pelas colunas. Variações comparam o último pregão com o
              pregão anterior, de sete e de trinta dias atrás.
            </p>
          </div>
          <PriceTable snapshots={sorted} params={params} regionName={regionName} />
        </section>

        <SellSimulator
          crops={cropsHere}
          series={yearSeries}
          params={params}
          latestDate={latestDate}
        />

        <SourceFooter sources={sources} />
      </main>
    </div>
  );
}
