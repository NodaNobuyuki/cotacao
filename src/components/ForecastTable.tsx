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

/**
 * Day-by-day forecast.
 *
 * Soil moisture is a real column rather than a footnote because it stops
 * mid-table: Open-Meteo models it to roughly D+7 while temperature and ET₀ run
 * the full sixteen days. Those cells show a dash, and the caption says why —
 * an unexplained gap in the middle of a table reads as a bug.
 */
export function ForecastTable({ points }: { points: readonly WeatherPoint[] }) {
  const semSolo = points.some((p) => umidadeZonaRadicular(p) === null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <caption className="px-5 pb-3 text-left text-[12.5px] text-ink-soft">
          Previsão diária. A umidade do solo é modelada até cerca de sete dias à
          frente
          {semSolo ? ", por isso os dias mais distantes aparecem vazios" : ""}.
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
  );
}
