export function EmptyState() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold text-ink">Nenhuma cotação carregada</h1>
      <p className="text-sm text-ink-soft">
        O banco está vazio. Rode <code className="font-mono">npm run db:migrate</code> e{" "}
        <code className="font-mono">npm run ingest:daily</code> para carregar as
        cotações do CEPEA — ou <code className="font-mono">npm run db:seed</code>{" "}
        para popular o painel com dados sintéticos.
      </p>
    </main>
  );
}
