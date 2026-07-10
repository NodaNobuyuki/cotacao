import { daysSince, formatLongDate } from "@/lib/format";

/** Beyond this, a quote is old enough that acting on it could cost money. */
const STALE_AFTER_DAYS = 3;

/**
 * Two failure modes the prototype could not express, both of which matter more
 * than any feature on this page:
 *
 *   1. The numbers are invented. Saying "Fonte: CEPEA/ESALQ" above a random
 *      walk is the one thing that would make this dashboard dishonest.
 *   2. Ingestion died on Tuesday and the page still cheerfully renders
 *      Tuesday's price on Friday. Stale data must *look* stale.
 */
export function DataBanner({
  sources,
  latestDate,
}: {
  sources: string[];
  latestDate: string | undefined;
}) {
  const synthetic = sources.includes("synthetic");
  const stale = latestDate !== undefined && daysSince(latestDate) > STALE_AFTER_DAYS;

  if (!synthetic && !stale) return null;

  return (
    <div className="flex flex-col gap-2">
      {synthetic && (
        <p
          role="status"
          className="rounded-xl border border-dashed border-line-input bg-surface-muted px-4 py-3 text-[12.5px] text-ink-muted"
        >
          <b className="font-semibold text-ink">Dados sintéticos.</b> Os preços
          exibidos são gerados por simulação para demonstração e não refletem o
          mercado real. Nenhum indicador CEPEA/ESALQ é reproduzido aqui.
        </p>
      )}

      {stale && latestDate && (
        <p
          role="alert"
          className="rounded-xl border px-4 py-3 text-[12.5px]"
          style={{
            borderColor: "var(--color-down)",
            background: "rgba(192,57,43,0.06)",
            color: "var(--color-down)",
          }}
        >
          <b className="font-semibold">Cotações desatualizadas.</b> A última
          cotação disponível é de {formatLongDate(latestDate)}, há{" "}
          {daysSince(latestDate)} dias. A ingestão pode estar interrompida.
        </p>
      )}
    </div>
  );
}
