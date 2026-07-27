# Camada de ingestão de clima (Open-Meteo)

Dados agrometeorológicos por coordenada, isolados atrás da interface
`WeatherDataSource` ([types.ts](types.ts)). Mesmo princípio da camada de preços:
o resto da aplicação nunca importa `OpenMeteoSource` diretamente.

Diferente do CEPEA, a interface mora **fora** da pasta do provedor — a ClimAPI
da Embrapa já é prevista como segunda implementação, então o contrato é
compartilhado desde o começo.

Sem chave de API, sem scraping, sem browser: dois endpoints JSON alcançados com
`fetch` nativo. Validado contra a API real em 2026-07-27.

## Como funciona

1. **[openmeteo/params.ts](openmeteo/params.ts)** — os nomes exatos das
   variáveis e as grades de profundidade de cada endpoint. Confirmados contra a
   API, não escritos de memória: os nomes já mudaram de forma antes
   (`relativehumidity_2m` → `relative_humidity_2m`).
2. **[openmeteo/source.ts](openmeteo/source.ts)** — `OpenMeteoSource`, com
   validação de coordenada/data, retry com backoff, timeout e cache TTL.
3. **[openmeteo/parse.ts](openmeteo/parse.ts)** — JSON colunar → `WeatherPoint[]`,
   agregação do solo horário para diário, e `umidadeZonaRadicular`.
4. **[locais.ts](locais.ts)** — catálogo de 16 municípios de SP e PR, com
   coordenadas resolvidas pela API de geocoding do próprio Open-Meteo.

## Quatro descobertas que moldaram o desenho

Todas verificadas na API real. Mexer aqui sem saber disso quebra coisas de
forma silenciosa:

- **As profundidades de solo diferem entre os dois endpoints.** A previsão
  (ICON) reporta `0-1, 1-3, 3-9, 9-27, 27-81cm`; o histórico (ERA5) reporta
  `0-7, 7-28, 28-100, 100-255cm`. **Não são a mesma série** — por isso todo
  `WeatherPoint` carrega `modelo`, e é por isso que `modelo` é obrigatório e não
  opcional.
- **Umidade de solo só é modelada até ~D+7**, embora temperatura de solo vá até
  D+15 e ET₀ cubra os 16 dias. Pedir `forecast_days=16` devolve metade da janela
  sem umidade de solo. Isso **não é bug** — é o horizonte do modelo, e a tabela
  do painel diz isso em vez de deixar buraco inexplicado.
- **Solo só existe em `hourly`.** Não há agregado diário para solo em nenhum dos
  dois endpoints; `aggregateSoilByDay` faz a média das 24 horas, agrupando pela
  data do timestamp e não por passo fixo de 24 (um dia de horário de verão tem
  23 ou 25 horas).
- **O archive praticamente não tem atraso.** Em 2026-07-27 o ERA5 já respondia
  até 2026-07-26, então `getHistorical` não precisa de ponte com `past_days`.

## Por que as camadas de solo não são normalizadas

`SoilLayer` guarda as profundidades nativas do modelo. Colapsar ICON e ERA5 numa
grade comum significaria fabricar valores que nenhum dos dois produziu.

A comparação entre modelos fica numa função pura e testável,
`umidadeZonaRadicular`, que faz média ponderada pela espessura que cai dentro de
0–30cm. Uma camada que atravessa a fronteira (os 28-100cm do ERA5) contribui só
com os 2cm que se sobrepõem. Na prática os dois modelos batem: Ribeirão Preto
deu 0,307 na previsão contra ~0,29 no histórico, sem degrau.

## Nulo nunca vira zero

Todo campo de medição é `number | null`, e `0` significa zero medido. Um dia sem
leitura de chuva não entra como dia seco, e `balancoHidrico` só soma dias em que
chuva **e** ET₀ são conhecidas — somar uma série cheia de chuva contra uma série
parcial de ET₀ inflaria o saldo.

## Resiliência

Mesmo padrão da camada de preços. `fetchMany` isola falhas: uma coordenada que
falha é logada e pulada, o lote continua. Uma chamada única ainda rejeita — quem
perguntou por um lugar só merece saber que falhou.

Retry com backoff exponencial cobre falha de rede e 5xx. **Um 400 nunca é
retentado**: o Open-Meteo responde assim quando o parâmetro está errado, e
insistir só gasta o tempo de todo mundo.

## Cache

`TtlCache` em memória, chaveado pela URL completa. Previsão 30 min, histórico
24h (reanálise de um dia fechado não muda). É para colapsar a rajada de chamadas
idênticas de um único render, não para sobreviver a restart.

## Uso

```ts
import { OpenMeteoSource, resolveLocal, umidadeZonaRadicular } from "@/sources/weather";

const source = new OpenMeteoSource();
const local = resolveLocal("ribeirao-preto");

const previsao = await source.getForecast(local.lat, local.lon, 7);
const historico = await source.getHistorical(local.lat, local.lon, "2026-06-01", "2026-06-30");

umidadeZonaRadicular(previsao[0]); // 0.307 — comparável entre os dois modelos
```

## Licença dos dados

Open-Meteo sob **CC BY 4.0**, uso não comercial na camada gratuita. Todo
`WeatherPoint` carrega `fonte: "Open-Meteo"`, e `OPEN_METEO_ATRIBUICAO` leva o
crédito obrigatório até o rodapé da página.

## Ainda não feito, de propósito

- Integração com Drizzle/banco — a página lê a API ao vivo, com cache.
- Job scheduler.
- Cruzamento com preços (a feature "janela de venda/manejo" vem depois).
- Série horária: `diasParaPulverizacao` faz triagem de **dias**, usando vento
  máximo diário como proxy conservador. Responder "pulverize às 7h" exige o
  bloco `hourly`, que esta camada ainda não busca — e a UI não finge precisão
  que não tem.
