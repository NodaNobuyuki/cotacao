import Link from "next/link";
import { notFound } from "next/navigation";
import { ComparisonChart } from "@/components/ComparisonChart";
import { DataBanner } from "@/components/DataBanner";
import { DeltaPill } from "@/components/CropCard";
import { EmptyState } from "@/components/EmptyState";
import { RegionSelect } from "@/components/RegionSelect";
import { Segmented } from "@/components/Segmented";
import { SourceFooter } from "@/components/SourceFooter";
import {
  latestQuoteDate,
  listCrops,
  listRegions,
  quotesForCrop,
  regionsForCrop,
  sourcesForRegion,
} from "@/db/queries";
import { buildChartSeries, windowExtremes } from "@/domain/dashboard";
import { latest } from "@/domain/series";
import { computeVariation } from "@/domain/variation";
import { formatLongDate, formatPrice } from "@/lib/format";
import { buildCropHref, parseCropDetailParams, PERIODS, type SearchParams } from "@/lib/params";

// Prices change once a day; matches the dashboard's revalidation window.
export const revalidate = 300;

const PERIOD_LABELS: Record<number, string> = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
  365: "1 ano",
};

export default async function CropDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cropId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { cropId } = await params;
  const sp = await searchParams;

  const [regions, crops, regionsHere] = await Promise.all([
    listRegions(),
    listCrops(),
    regionsForCrop(cropId),
  ]);

  if (regions.length === 0 || crops.length === 0) {
    return <EmptyState />;
  }

  const crop = crops.find((c) => c.id === cropId);
  if (!crop) notFound();

  if (regionsHere.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold text-ink">{crop.name}</h1>
        <p className="text-sm text-ink-soft">
          Nenhuma cotação registrada para esta cultura em nenhuma praça ainda.
        </p>
        <Link href="/" className="text-[13px] font-medium text-ink underline underline-offset-2">
          Voltar ao painel
        </Link>
      </main>
    );
  }

  const detail = parseCropDetailParams(
    sp,
    regionsHere.map((r) => r.id),
  );

  const [series, latestDate, sources] = await Promise.all([
    quotesForCrop(detail.region, cropId, detail.period),
    latestQuoteDate(detail.region),
    sourcesForRegion(detail.region),
  ]);

  const currentQuote = latest(series);
  const variation = computeVariation(series);
  const extremes = windowExtremes(series, detail.period);
  const chartSeries = buildChartSeries(
    [crop],
    new Map([[cropId, series]]),
    [cropId],
    detail.period,
    "brl",
  );
  const regionName = regionsHere.find((r) => r.id === detail.region)?.name ?? detail.region;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-line bg-canvas/85 px-4 py-[13px] backdrop-blur-md sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-[11px] shrink-0 rounded-[3px]"
            style={{ background: crop.colorHex }}
          />
          <div>
            <p className="text-[16.5px] font-semibold tracking-[-0.01em] text-ink">
              {crop.name}
            </p>
            <Link href="/" className="text-xs text-ink-soft underline underline-offset-2">
              Voltar ao painel
            </Link>
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
          <RegionSelect regions={regionsHere} params={detail} cropId={cropId} />
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-[1240px] px-4 pb-16 pt-5 sm:px-6 lg:px-10">
        <DataBanner sources={sources} latestDate={latestDate} />

        <section className="mt-6" aria-labelledby="kpis">
          <div className="mb-4">
            <h2 id="kpis" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
              {crop.name}
            </h2>
            <p className="mt-[3px] text-[12.5px] text-ink-soft">
              {crop.unit} · Fechamento mais recente em {regionName}
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[14px]">
            <div className="rounded-2xl border border-line bg-surface p-[18px]">
              <p className="text-[11px] text-ink-faint">Preço atual</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">
                <span className="mr-[3px] text-[13px] font-medium text-ink-faint">R$</span>
                {currentQuote ? formatPrice(currentQuote.price) : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-[18px]">
              <p className="text-[11px] text-ink-faint">Variação (dia)</p>
              <div className="mt-2">
                <DeltaPill value={variation.day} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-[18px]">
              <p className="text-[11px] text-ink-faint">Variação (semana)</p>
              <div className="mt-2">
                <DeltaPill value={variation.week} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-[18px]">
              <p className="text-[11px] text-ink-faint">Variação (mês)</p>
              <div className="mt-2">
                <DeltaPill value={variation.month} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-[18px]">
              <p className="text-[11px] text-ink-faint">
                Mínima no período ({PERIOD_LABELS[detail.period]})
              </p>
              <p className="mt-1 font-mono text-[15px] font-medium text-ink">
                {extremes ? `R$ ${formatPrice(extremes.min)}` : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-[18px]">
              <p className="text-[11px] text-ink-faint">
                Máxima no período ({PERIOD_LABELS[detail.period]})
              </p>
              <p className="mt-1 font-mono text-[15px] font-medium text-ink">
                {extremes ? `R$ ${formatPrice(extremes.max)}` : "—"}
              </p>
            </div>
          </div>
        </section>

        <section
          className="mt-[26px] rounded-[18px] border border-line bg-surface p-4 sm:p-6"
          aria-labelledby="historico"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-[14px]">
            <div className="max-w-[520px]">
              <h2 id="historico" className="text-base font-semibold text-ink">
                Histórico de preços
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-soft">Preço absoluto em reais.</p>
            </div>
            <Segmented
              label="Período exibido"
              options={PERIODS.map((p) => ({
                label: PERIOD_LABELS[p]!,
                href: buildCropHref(cropId, detail, { period: p }),
                active: detail.period === p,
              }))}
            />
          </div>

          <ComparisonChart series={chartSeries} metric="brl" />
        </section>

        <SourceFooter sources={sources} />
      </main>
    </div>
  );
}
