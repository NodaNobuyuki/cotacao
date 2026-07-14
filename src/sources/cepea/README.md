# Camada de ingestão CEPEA (scraper híbrido)

Ingestão de indicadores de preço do CEPEA/ESALQ isolada atrás da interface
`PriceDataSource` ([types.ts](types.ts)). O resto da aplicação nunca importa o
scraper diretamente — trocar para a API paga do CEPEA no futuro significa
escrever uma nova implementação da interface, sem tocar em mais nada.

Validado contra o site real em 2026-07-13: 80 cotações de boi gordo e soja
ingeridas ponta a ponta.

## Como funciona

1. **[session.ts](session.ts)** — Playwright abre a página de consulta apenas
   para o Cloudflare emitir `cf_clearance` (+ `PHPSESSID`). Cookies, User-Agent
   e timestamp vão para `data/cepea/session.json`. No mesmo passo, o mapeamento
   produto → id do form é extraído para `data/cepea/products.json`.
2. **[http.ts](http.ts)** — cliente `fetch` puro que reusa os cookies, com
   throttling (3s + jitter) e detecção de expiração (403/503 ou HTML de
   challenge no lugar de JSON → `CepeaChallengeError`).
3. **[source.ts](source.ts)** — `CepeaHybridScraperSource` executa o fluxo
   confirmado via HAR (listar_especificacao → consulta → download do `.xls`),
   renova a sessão automaticamente uma vez quando o cookie expira (TTL 25 min)
   e arquiva todo `.xls` bruto em `data/cepea/raw/` antes de parsear. Série que
   falha é logada e pulada; o lote continua.
4. **[parser.ts](parser.ts)** — parse do `.xls` legado (SheetJS), localizando a
   linha de cabeçalho "Data" em vez de assumir offsets fixos.

## Três armadilhas descobertas na prática

Custaram tempo e não são óbvias no HAR — mexer aqui sem saber disso quebra tudo:

- **`cf_clearance` não significa challenge resolvido.** O Cloudflare emite esse
  cookie *durante* o desafio (junto de `cf_chl_rc_ni`), e requisições feitas com
  ele voltam como "Just a moment". O único sinal confiável é o formulário real
  estar na tela — é isso que `isConsultaPageLoaded` checa.
- **Chromium precisa de `--disable-blink-features=AutomationControlled`.** Sem
  a flag o interstitial entra em loop e nunca libera.
- **O domínio apex não serve o desafio.** `cepea.org.br` responde 403 seco;
  só `www.cepea.org.br` devolve um challenge resolvível.

Uma vez o desafio realmente resolvido, `fetch` puro do Node funciona (200 +
JSON) — não há barreira de fingerprint TLS, e a arquitetura híbrida se sustenta.

## Formato real do `.xls`

```
Boi | INDICADOR DO BOI GORDO CEPEA/ESALQ     ← produto | série
Nota   por arroba, descontado o Prazo de …   ← a unidade mora aqui
Fonte  Cepea
Data   Valor                                 ← cabeçalho (nem sempre traz "R$")
01/07/2026   335,30
```

Algumas séries têm coluna US$ ("À vista R$" / "À vista US$"); outras não
declaram unidade em lugar nenhum — nesse caso `unidade` fica vazia, e não
inventamos uma.

## Uso

```bash
# job diário: CEPEA → banco (últimos 15 dias, idempotente)
npm run ingest:daily
npm run ingest:daily -- --dias 400   # backfill

# exploração, sem tocar no banco: imprime as cotações
npm run ingest:cepea
npx tsx scripts/ingest-cepea.ts --produto soja --inicio 2026-06-01 --fim 2026-07-10
```

Pré-requisito: `npx playwright install chromium`.

## Execução diária (Windows)

Tarefa agendada `CotacaoDoCampo-IngestDaily`, todo dia às 19h, chamando
[scripts/ingest-daily.cmd](../../../scripts/ingest-daily.cmd), que loga em
`data/cepea/logs/ingest-AAAAMMDD.log`.

```powershell
Get-ScheduledTask -TaskName "CotacaoDoCampo-IngestDaily" | Get-ScheduledTaskInfo
Start-ScheduledTask  -TaskName "CotacaoDoCampo-IngestDaily"   # rodar agora
Unregister-ScheduledTask -TaskName "CotacaoDoCampo-IngestDaily" -Confirm:$false
```

**A tarefa precisa de sessão interativa (usuário logado).** O challenge do
Cloudflare *não* passa em modo headless — testado com Chromium headless puro e
com `playwright-extra` + plugin stealth; ambos ficam presos em "Um momento…".
Ou seja, uma janela do Chromium abre por ~50s durante a ingestão. Num servidor
Linux isso exige display virtual (Xvfb) e um IP não-datacenter; em serverless
(Vercel/Lambda) não roda.

O job re-ingere uma janela de 15 dias, não só "ontem": o CEPEA revisa
indicadores após a publicação, e uma execução que falhar na terça é consertada
pela execução de quarta sem intervenção. `ingestRange` é idempotente (índice
único em crop/praça/data/fonte), então a sobreposição vira update.

Se a ingestão parar, o painel **mostra que parou**: `DataBanner` exibe alerta de
"cotações desatualizadas" quando a última cotação passa de 3 dias.

## Licença dos dados

Dados do CEPEA sob **CC BY-NC 4.0** — todo `PricePoint` carrega
`fonte: "CEPEA/ESALQ"` para a atribuição obrigatória sobreviver até a UI. O
scraper roda em baixa frequência (1x/dia via cron), com rate limiting.

## Do scraper ao painel

[adapter.ts](adapter.ts) (`CepeaPriceSource`) é a única peça que fala as duas
línguas: produto/série/praça do CEPEA de um lado, crop/region do dashboard do
outro. Ele implementa a `PriceSource` que o app já consumia, então
[scripts/ingest-daily.ts](../../../scripts/ingest-daily.ts) reusa
`syncReferenceData` + `ingestRange` sem nada novo no banco.

Regra do mapeamento: **uma série por (cultura, praça)**. O índice único é
(crop, region, date, source), então mapear duas séries para o mesmo par faria
uma sobrescrever a outra silenciosamente — por isso a série "Boi Gordo - Média
a Prazo" (segunda metodologia para o mesmo boi, no mesmo estado) fica de fora.

Séries mapeadas hoje: boi gordo (SP), soja (PR e Paranaguá), milho (SP). As
praças são as do CEPEA, não uma lista arrumadinha de UFs.
