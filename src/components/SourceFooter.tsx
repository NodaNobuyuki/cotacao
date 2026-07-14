/**
 * Attribution for the CEPEA data.
 *
 * Not decoration: CEPEA publishes its indicators under CC BY-NC 4.0, which
 * requires visible credit to the source wherever the data is shown. It renders
 * only when a CEPEA-sourced row is actually on the page — crediting CEPEA above
 * synthetic data would be worse than not crediting them at all.
 */
export function SourceFooter({ sources }: { sources: string[] }) {
  if (!sources.includes("cepea")) return null;

  return (
    <footer className="mt-8 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-soft">
      <p>
        <b className="font-semibold text-ink">Fonte: CEPEA/ESALQ</b> — Centro de
        Estudos Avançados em Economia Aplicada, Esalq/USP. Indicadores
        reproduzidos sob licença{" "}
        <a
          href="https://creativecommons.org/licenses/by-nc/4.0/deed.pt_BR"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          CC BY-NC 4.0
        </a>
        , para uso não comercial. Este painel não é afiliado ao CEPEA.
      </p>
      <p className="mt-1.5 text-ink-faint">
        Os valores são indicadores de referência e não constituem recomendação
        de compra ou venda.
      </p>
    </footer>
  );
}
