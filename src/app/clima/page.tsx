import type { Metadata } from "next";
import { ArmSwitch } from "@/components/ArmSwitch";
import { ForecastTable } from "@/components/ForecastTable";
import { LocalSelect } from "@/components/LocalSelect";
import { Segmented } from "@/components/Segmented";
import { SoilProfile } from "@/components/SoilProfile";
import { WeatherSummary } from "@/components/WeatherSummary";
import { diasParaPulverizacao } from "@/domain/weather";
import { formatShortDate } from "@/lib/format";
import {
  buildWeatherHref,
  JANELAS,
  parseWeatherParams,
  type Janela,
} from "@/lib/weather-params";
import type { SearchParams } from "@/lib/params";
import { OPEN_METEO_ATRIBUICAO, OpenMeteoSource } from "@/sources/weather";
import type { WeatherPoint } from "@/sources/weather";

export const metadata: Metadata = {
  title: "Clima | Cotação do Campo",
  description:
    "Previsão agrometeorológica por município: chuva, evapotranspiração, umidade do solo e vento.",
};

// Open-Meteo refreshes its forecast about hourly; the source caches in-process
// on top of this, so a burst of renders costs one upstream call.
export const revalidate = 1800;

const JANELA_LABELS: Record<number, string> = { 7: "7 dias", 16: "16 dias" };

export default async function ClimaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = parseWeatherParams(sp);
  const { local } = params;

  let points: readonly WeatherPoint[] = [];
  let erro: string | null = null;
  try {
    const source = new OpenMeteoSource();
    points = await source.getForecast(local.lat, local.lon, params.janela);
  } catch (error) {
    // The weather arm going down must not render a broken page — it says so.
    erro = error instanceof Error ? error.message : String(error);
  }

  const hoje = points[0];
  const pulverizacao = diasParaPulverizacao(points);

  return (
    // data-arm re-points the neutral tokens at the cold weather ramp for
    // everything below it, shared controls included. See globals.css.
    <div data-arm="clima" className="min-h-screen bg-canvas">
      {/* Same two-row split as the price arm; see the comment there. */}
      <header className="sticky top-0 z-30 flex flex-col gap-2.5 border-b border-line bg-canvas/85 px-4 py-2.5 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-[13px] lg:px-10">
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-[11px] bg-ink font-mono text-base font-bold text-white sm:size-10 sm:text-lg"
            >
              ◈
            </div>
            <div>
              <p className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink sm:text-[16.5px]">
                AgroWeather
              </p>
              <p className="hidden text-xs text-ink-soft sm:block">
                Clima por município
              </p>
            </div>
          </div>
          <ArmSwitch active="clima" />
        </div>

        <div className="flex">
          <LocalSelect params={params} />
        </div>
      </header>

      <main
        id="conteudo"
        className="mx-auto max-w-[1240px] px-4 pb-16 pt-5 sm:px-6 lg:px-10"
      >
        {erro !== null ? (
          <div className="rounded-[14px] border border-clima-alerta bg-surface p-6">
            <h2 className="text-base font-semibold text-clima-alerta">
              Não foi possível consultar o clima agora
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              A previsão vem do Open-Meteo e a consulta falhou: {erro}. Os preços
              seguem disponíveis normalmente.
            </p>
          </div>
        ) : (
          <>
            <section className="mt-2" aria-labelledby="condicoes">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-[14px]">
                <div>
                  <h2
                    id="condicoes"
                    className="text-[17px] font-semibold tracking-[-0.01em] text-ink"
                  >
                    Condições em {local.nome}
                  </h2>
                  <p className="mt-[3px] text-[12.5px] text-ink-soft">
                    Próximos {params.janela} dias · {local.lat.toFixed(2)},{" "}
                    {local.lon.toFixed(2)}
                  </p>
                </div>
                <Segmented
                  label="Janela de previsão"
                  options={JANELAS.map((j) => ({
                    label: JANELA_LABELS[j] ?? `${j} dias`,
                    href: buildWeatherHref(params, { janela: j as Janela }),
                    active: params.janela === j,
                  }))}
                />
              </div>

              <WeatherSummary points={points} janela={params.janela} />
            </section>

            <section
              className="mt-[26px] rounded-[18px] border border-line bg-surface p-4 sm:p-6"
              aria-labelledby="pulverizacao"
            >
              <h2 id="pulverizacao" className="text-base font-semibold text-ink">
                Dias favoráveis à pulverização
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-soft">
                Vento máximo até 10 km/h, umidade relativa média acima de 55% e
                sem chuva no dia. É uma triagem de dias, não de horários — a
                janela boa costuma ser o começo da manhã.
              </p>
              {pulverizacao.length === 0 ? (
                <p className="mt-4 text-[13px] text-ink-muted">
                  Nenhum dia da janela reúne as três condições.
                </p>
              ) : (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {pulverizacao.map((p) => (
                    <li
                      key={p.data}
                      className="rounded-[9px] border border-clima-favoravel/35 bg-clima-favoravel/8 px-3 py-1.5 font-mono text-[12.5px] text-clima-favoravel"
                    >
                      {formatShortDate(p.data)}
                      <span className="ml-2 text-clima-favoravel/70">
                        {p.ventoVelocidadeMaxKmh?.toFixed(0)} km/h ·{" "}
                        {p.umidadeRelativaMediaPct?.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="mt-[26px] grid gap-[26px] lg:grid-cols-[1fr_360px]">
              <section
                className="overflow-hidden rounded-[18px] border border-line bg-surface"
                aria-labelledby="previsao"
              >
                <div className="px-5 pb-1 pt-[18px]">
                  <h2 id="previsao" className="text-base font-semibold text-ink">
                    Previsão diária
                  </h2>
                </div>
                <ForecastTable points={points} />
              </section>

              {hoje !== undefined && (
                <section
                  className="rounded-[18px] border border-line bg-surface p-5"
                  aria-label="Perfil do solo"
                >
                  <SoilProfile point={hoje} />
                </section>
              )}
            </div>
          </>
        )}

        <footer className="mt-8 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-soft">
          <p>
            <b className="font-semibold text-ink">Fonte: Open-Meteo</b> —{" "}
            {OPEN_METEO_ATRIBUICAO}. Previsão de modelos de serviços
            meteorológicos nacionais, resolução de 1 a 11 km.
          </p>
          <p className="mt-1.5 text-ink-faint">
            Previsão meteorológica é incerta por natureza e a incerteza cresce
            com o horizonte. Use como apoio à decisão, não como garantia.
          </p>
        </footer>
      </main>
    </div>
  );
}
