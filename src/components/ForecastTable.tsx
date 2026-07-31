import type { WeatherPoint } from "@/sources/weather";
import { umidadeZonaRadicular } from "@/sources/weather";
import { rosaDosVentos } from "@/domain/weather";
import { formatShortDate } from "@/lib/format";

function num(value: number | null, decimals = 1): string {
  return value === null
    ? "—"
    : value.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}

const TH =
  "px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint";
const TD = "px-3 py-2 font-mono text-[12.5px] text-ink";

function legenda(semSolo: boolean): string {
  return `Previsão diária. A umidade do solo é modelada até cerca de sete dias à frente${
    semSolo ? ", por isso os dias mais distantes aparecem vazios" : ""
  }.`;
}

/**
 * Day-by-day forecast.
 *
 * Soil moisture is a real column rather than a footnote because it stops
 * mid-table: Open-Meteo models it to roughly D+7 while temperature and ET₀ run
 * the full sixteen days. Those cells show a dash, and the caption says why —
 * an unexplained gap in the middle of a table reads as a bug.
 *
 * Seven columns do not fit a phone. The table had `min-w-[640px]` inside
 * `overflow-x-auto`, so a sixteen-day forecast was a sideways scroll with no
 * hint it existed; below `sm` each day becomes a card instead. Only one branch
 * renders at a time — the other is `display: none` and so is also absent from
 * the accessibility tree.
 */
export function ForecastTable({ points }: { points: readonly WeatherPoint[] }) {
  const semSolo = points.some((p) => umidadeZonaRadicular(p) === null);

  return (
    <>
      <MobileList points={points} semSolo={semSolo} />

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="px-5 pb-3 text-left text-[12.5px] text-ink-soft">
            {legenda(semSolo)}
          </caption>
          <thead>
            <tr className="border-y border-line bg-surface-muted">
              <th scope="col" className={TH}>
                Dia
              </th>
              <th scope="col" className={TH}>
                Mín / Máx
              </th>
              <th scope="col" className={TH}>
                Chuva
              </th>
              <th scope="col" className={TH}>
                ET₀
              </th>
              <th scope="col" className={TH}>
                UR média
              </th>
              <th scope="col" className={TH}>
                Vento
              </th>
              <th scope="col" className={TH}>
                Solo 0–30cm
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const solo = umidadeZonaRadicular(p);
              const chuva = p.precipitacaoMm ?? 0;
              return (
                <tr key={p.data} className="border-b border-line-soft last:border-0">
                  <td className={`${TD} font-medium`}>{formatShortDate(p.data)}</td>
                  <td className={TD}>
                    <span className="text-ink-muted">{num(p.tempMinC, 0)}°</span>
                    <span className="mx-1 text-ink-faint">/</span>
                    {num(p.tempMaxC, 0)}°
                  </td>
                  <td
                    className={`${TD} ${chuva >= 1 ? "font-semibold text-clima-agua" : ""}`}
                  >
                    {num(p.precipitacaoMm)} <span className="text-ink-faint">mm</span>
                  </td>
                  <td className={TD}>
                    {num(p.evapotranspiracaoMm)} <span className="text-ink-faint">mm</span>
                  </td>
                  <td className={TD}>
                    {num(p.umidadeRelativaMediaPct, 0)}
                    <span className="text-ink-faint">%</span>
                  </td>
                  <td className={TD}>
                    {num(p.ventoVelocidadeMaxKmh, 0)}{" "}
                    <span className="text-ink-faint">
                      km/h {rosaDosVentos(p.ventoDirecaoDominanteGraus)}
                    </span>
                  </td>
                  <td className={`${TD} ${solo === null ? "text-ink-faint" : ""}`}>
                    {solo === null ? "—" : `${num(solo * 100)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Metric({
  rotulo,
  children,
  destaque = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">{rotulo}</dt>
      <dd
        className={`mt-px font-mono text-[13px] ${destaque ? "font-semibold text-clima-agua" : "text-ink"}`}
      >
        {children}
      </dd>
    </div>
  );
}

function MobileList({
  points,
  semSolo,
}: {
  points: readonly WeatherPoint[];
  semSolo: boolean;
}) {
  return (
    <div className="sm:hidden">
      <p className="px-5 pb-3 text-[12.5px] text-ink-soft">{legenda(semSolo)}</p>

      <ul aria-label="Previsão diária" className="border-t border-line">
        {points.map((p) => {
          const solo = umidadeZonaRadicular(p);
          const chuva = p.precipitacaoMm ?? 0;
          return (
            <li key={p.data} className="border-b border-line-soft px-5 py-3.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <b className="text-[13.5px] font-semibold text-ink">
                  {formatShortDate(p.data)}
                </b>
                <span className="font-mono text-[13.5px] text-ink">
                  <span className="text-ink-muted">{num(p.tempMinC, 0)}°</span>
                  <span className="mx-1 text-ink-faint">/</span>
                  {num(p.tempMaxC, 0)}°
                </span>
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                <Metric rotulo="Chuva" destaque={chuva >= 1}>
                  {num(p.precipitacaoMm)} <span className="text-ink-faint">mm</span>
                </Metric>
                <Metric rotulo="ET₀">
                  {num(p.evapotranspiracaoMm)} <span className="text-ink-faint">mm</span>
                </Metric>
                <Metric rotulo="UR média">
                  {num(p.umidadeRelativaMediaPct, 0)}
                  <span className="text-ink-faint">%</span>
                </Metric>
                <Metric rotulo="Vento">
                  {num(p.ventoVelocidadeMaxKmh, 0)}{" "}
                  <span className="text-ink-faint">
                    km/h {rosaDosVentos(p.ventoDirecaoDominanteGraus)}
                  </span>
                </Metric>
                <Metric rotulo="Solo 0–30cm">
                  {solo === null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    `${num(solo * 100)}%`
                  )}
                </Metric>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
