import type { WeatherPoint } from "@/sources/weather";

/**
 * The soil column for one day, at the model's own depths.
 *
 * The bands are drawn proportional to their real thickness, and each is
 * labelled with its depth range, because the grid is not a presentation
 * detail: the forecast model (ICON) reports 0-1 … 27-81cm while the archive
 * (ERA5) reports 0-7 … 100-255cm. Rendering both as four identical stripes
 * would imply a correspondence that does not exist.
 */
export function SoilProfile({ point }: { point: WeatherPoint }) {
  const layers = point.solo;
  if (layers.length === 0) return null;

  const fundo = layers[layers.length - 1]?.profundidadeBaseCm ?? 1;

  return (
    <div>
      <h3 className="text-base font-semibold text-ink">Perfil do solo</h3>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        Umidade volumétrica por profundidade, nas camadas que o modelo publica.
      </p>

      <ol className="mt-4 space-y-1">
        {layers.map((layer) => {
          const espessura = layer.profundidadeBaseCm - layer.profundidadeTopoCm;
          // Water content rarely exceeds ~0.5 m³/m³; scale the bar to that so
          // real differences are visible instead of all bars looking half full.
          const preenchimento =
            layer.umidade === null ? 0 : Math.min(layer.umidade / 0.5, 1) * 100;

          return (
            <li
              key={`${layer.profundidadeTopoCm}-${layer.profundidadeBaseCm}`}
              className="flex items-center gap-2 sm:gap-3"
              // Thickness is proportional, with a floor so ICON's 0-1cm band
              // stays readable rather than collapsing to a hairline.
              style={{ minHeight: `${Math.max((espessura / fundo) * 120, 26)}px` }}
            >
              <span className="w-[62px] shrink-0 text-right font-mono text-[11px] text-ink-muted sm:w-[74px]">
                {layer.profundidadeTopoCm}–{layer.profundidadeBaseCm}cm
              </span>
              <span className="h-[18px] flex-1 overflow-hidden rounded-[5px] bg-segment">
                <span
                  className="block h-full rounded-[5px] bg-clima-solo/70"
                  style={{ width: `${preenchimento}%` }}
                />
              </span>
              <span className="w-[74px] shrink-0 font-mono text-[11.5px] text-ink sm:w-[86px]">
                {layer.umidade === null ? (
                  <span className="text-ink-faint">sem dado</span>
                ) : (
                  `${(layer.umidade * 100).toFixed(1)}%`
                )}
                {layer.temperatura !== null && (
                  <span className="ml-1.5 text-ink-faint">
                    {layer.temperatura.toFixed(0)}°
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
