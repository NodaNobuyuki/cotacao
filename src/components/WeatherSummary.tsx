import type { WeatherPoint } from "@/sources/weather";
import {
  balancoHidrico,
  chuvaAcumulada,
  et0Acumulada,
  proximaChuva,
  umidadeSoloAtual,
} from "@/domain/weather";
import { formatShortDate } from "@/lib/format";

function Tile({
  rotulo,
  valor,
  unidade,
  nota,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  unidade?: string;
  nota: string;
  tom?: "neutro" | "agua" | "deficit" | "solo";
}) {
  // Deliberately not up/down: a surplus of water is not a gain and a deficit is
  // not a loss, they are different weather. Blue reads water, amber reads dry.
  const cor = {
    neutro: "text-ink",
    agua: "text-clima-agua",
    deficit: "text-clima-deficit",
    solo: "text-clima-solo",
  }[tom];
  return (
    <div className="rounded-[14px] border border-line bg-surface p-4">
      <p className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
        {rotulo}
      </p>
      <p className={`mt-1.5 font-mono text-[22px] font-semibold ${cor}`}>
        {valor}
        {unidade !== undefined && (
          <span className="ml-1 text-[12px] font-medium text-ink-soft">{unidade}</span>
        )}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-ink-soft">{nota}</p>
    </div>
  );
}

function num(value: number | null, decimals = 1): string {
  return value === null
    ? "—"
    : value.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}

/**
 * The four numbers that decide field work in the coming days.
 *
 * Water balance leads because it is the one a producer cannot read off any
 * single variable: 20mm of rain against 45mm of ET₀ is still a deficit, and
 * showing rainfall alone would say the opposite.
 */
export function WeatherSummary({
  points,
  janela,
}: {
  points: readonly WeatherPoint[];
  janela: number;
}) {
  const chuva = chuvaAcumulada(points);
  const et0 = et0Acumulada(points);
  const balanco = balancoHidrico(points);
  const solo = umidadeSoloAtual(points);
  const proxima = proximaChuva(points);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[14px]">
      <Tile
        rotulo={`Balanço hídrico ${janela}d`}
        valor={balanco === null ? "—" : `${balanco > 0 ? "+" : ""}${num(balanco)}`}
        unidade="mm"
        tom={balanco === null ? "neutro" : balanco >= 0 ? "agua" : "deficit"}
        nota={
          balanco === null
            ? "Sem dados suficientes no período."
            : balanco >= 0
              ? "Chuva prevista supera a perda por evapotranspiração."
              : "Perda por evapotranspiração supera a chuva prevista."
        }
      />
      <Tile
        rotulo={`Chuva ${janela}d`}
        valor={num(chuva.mm)}
        unidade="mm"
        tom="agua"
        nota={
          proxima === undefined
            ? "Nenhuma chuva relevante prevista na janela."
            : `Próxima chuva em ${formatShortDate(proxima.data)} (${num(proxima.precipitacaoMm)} mm).`
        }
      />
      <Tile
        rotulo={`Evapotranspiração ${janela}d`}
        valor={num(et0)}
        unidade="mm"
        tom="deficit"
        nota="ET₀ de referência, FAO-56 Penman-Monteith."
      />
      <Tile
        rotulo="Umidade do solo"
        valor={solo === null ? "—" : num(solo * 100, 1)}
        unidade="% vol."
        tom={solo === null ? "neutro" : "solo"}
        nota={
          solo === null
            ? "Fora do horizonte modelado para umidade de solo."
            : "Média ponderada da zona radicular (0–30 cm), hoje."
        }
      />
    </div>
  );
}
