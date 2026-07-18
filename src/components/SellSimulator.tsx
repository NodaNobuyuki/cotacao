import { backtestSale } from "@/domain/backtest";
import { shiftIsoDays } from "@/domain/series";
import type { CropMeta, Series } from "@/domain/types";
import { formatLongDate, formatPrice } from "@/lib/format";
import { PARAM, SIM_QTY_DEFAULT, type DashboardParams } from "@/lib/params";
import { DeltaPill } from "./CropCard";

/** "R$/arroba" → "arroba"; the quantity input is denominated in that. */
function quantityUnit(unit: string): string {
  return unit.replace(/^R\$\s*\/\s*/, "");
}

const inputClass =
  "rounded-[9px] border border-line-input bg-surface px-[11px] py-2 text-[13.5px] font-medium text-ink";

/**
 * "What if I had sold on date X?" — a plain GET form; crop, date and quantity
 * live in the query string like every other control on the page, so a
 * simulation is linkable and survives the back button. No client JavaScript:
 * the server recomputes on submit.
 *
 * The hidden inputs mirror buildHref's non-default serialisation — a GET form
 * replaces the whole query string, so anything not in the form is lost.
 */
export function SellSimulator({
  crops,
  series,
  params,
  latestDate,
}: {
  crops: readonly CropMeta[];
  series: ReadonlyMap<string, Series>;
  params: DashboardParams;
  latestDate: string | undefined;
}) {
  if (crops.length === 0 || !latestDate) return null;

  const crop = crops.find((c) => c.id === params.simCrop);
  const cropSeries = crop && series.get(crop.id);
  const result =
    cropSeries && params.simDate
      ? backtestSale(cropSeries, params.simDate, params.simQty)
      : undefined;

  // The loaded history is one year deep; the date picker says so instead of
  // accepting a date the data cannot answer.
  const minDate = shiftIsoDays(latestDate, -365);
  const unit = quantityUnit((crop ?? crops[0]!).unit);

  return (
    <section
      className="mt-[26px] rounded-[18px] border border-line bg-surface p-4 sm:p-6"
      aria-labelledby="simulador"
    >
      <div className="mb-4 max-w-[520px]">
        <h2 id="simulador" className="text-base font-semibold text-ink">
          E se eu tivesse vendido?
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Compare o resultado de uma venda passada com o preço mais recente.
          Datas sem pregão usam a cotação anterior mais próxima.
        </p>
      </div>

      <form method="get" action="/" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name={PARAM.region} value={params.region} />
        <input type="hidden" name={PARAM.crops} value={params.selected.join(",")} />
        {params.period !== 30 && (
          <input type="hidden" name={PARAM.period} value={params.period} />
        )}
        {params.metric !== "pct" && (
          <input type="hidden" name={PARAM.metric} value={params.metric} />
        )}
        {params.sortKey !== "dia" && (
          <input type="hidden" name={PARAM.sortKey} value={params.sortKey} />
        )}
        {params.sortDir !== "desc" && (
          <input type="hidden" name={PARAM.sortDir} value={params.sortDir} />
        )}

        <label className="flex flex-col gap-[3px]">
          <span className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
            Cultura
          </span>
          <select
            name={PARAM.simCrop}
            defaultValue={crop?.id ?? crops[0]!.id}
            className={`${inputClass} min-w-[160px] cursor-pointer`}
          >
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-[3px]">
          <span className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
            Data da venda
          </span>
          <input
            type="date"
            name={PARAM.simDate}
            defaultValue={params.simDate}
            min={minDate}
            max={latestDate}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-[3px]">
          <span className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
            Quantidade{unit ? ` (${unit})` : ""}
          </span>
          <input
            type="number"
            name={PARAM.simQty}
            defaultValue={params.simQty === SIM_QTY_DEFAULT ? undefined : params.simQty}
            placeholder={String(SIM_QTY_DEFAULT)}
            min="0.01"
            step="any"
            className={`${inputClass} w-[120px]`}
          />
        </label>

        <button
          type="submit"
          className="rounded-[9px] bg-ink px-4 py-2 text-[13.5px] font-semibold text-white"
        >
          Simular
        </button>
      </form>

      {crop && params.simDate && !result && (
        <p role="status" className="mt-4 text-[12.5px] text-ink-muted">
          Sem cotação de {crop.name} em ou antes de{" "}
          {formatLongDate(params.simDate)} no último ano.
        </p>
      )}

      {crop && result && (
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[14px]">
          <ResultTile
            label={`Vendendo em ${formatLongDate(result.sold.date)}`}
            price={result.sold.price}
            proceeds={result.proceedsThen}
            quantity={result.quantity}
          />
          <ResultTile
            label={`Vendendo hoje (${formatLongDate(result.current.date)})`}
            price={result.current.price}
            proceeds={result.proceedsNow}
            quantity={result.quantity}
          />
          <div className="flex flex-col justify-between gap-2 rounded-2xl border border-line bg-surface-muted p-[18px]">
            <p className="text-[11.5px] uppercase tracking-[0.07em] text-ink-faint">
              Diferença
            </p>
            <p className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">
              <span className="mr-[3px] text-[13px] font-medium text-ink-faint">R$</span>
              {formatPrice(result.proceedsNow - result.proceedsThen)}
            </p>
            <div>
              <DeltaPill value={result.changePct} />
            </div>
          </div>
        </div>
      )}

      {crop && result && result.sold.date !== params.simDate && (
        <p role="status" className="mt-3 text-[12px] text-ink-faint">
          Não houve pregão em {formatLongDate(params.simDate!)}; a simulação usa
          a cotação de {formatLongDate(result.sold.date)}.
        </p>
      )}
    </section>
  );
}

function ResultTile({
  label,
  price,
  proceeds,
  quantity,
}: {
  label: string;
  price: number;
  proceeds: number;
  quantity: number;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-2xl border border-line p-[18px]">
      <p className="text-[11.5px] uppercase tracking-[0.07em] text-ink-faint">{label}</p>
      <p className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">
        <span className="mr-[3px] text-[13px] font-medium text-ink-faint">R$</span>
        {formatPrice(proceeds)}
      </p>
      <p className="text-[12px] text-ink-muted">
        {formatPrice(quantity, 0)} × R$ {formatPrice(price)}
      </p>
    </div>
  );
}
