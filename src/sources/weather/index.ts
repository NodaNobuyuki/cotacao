export type {
  SoilLayer,
  WeatherDataSource,
  WeatherPoint,
  WeatherPointTipo,
} from "./types";
export {
  OpenMeteoError,
  OpenMeteoSource,
  OPEN_METEO_ATRIBUICAO,
  OPEN_METEO_FONTE,
} from "./openmeteo/source";
export type { OpenMeteoConfig } from "./openmeteo/source";
export { umidadeZonaRadicular } from "./openmeteo/parse";
export {
  findLocal,
  LOCAIS,
  LOCAL_PADRAO,
  resolveLocal,
} from "./locais";
export type { LocalClimatico } from "./locais";
