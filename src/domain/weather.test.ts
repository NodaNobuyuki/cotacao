import { describe, expect, it } from "vitest";
import type { SoilLayer, WeatherPoint } from "../sources/weather/types";
import {
  balancoHidrico,
  chuvaAcumulada,
  diasParaPulverizacao,
  et0Acumulada,
  horizonteSolo,
  proximaChuva,
  rosaDosVentos,
  umidadeSoloAtual,
} from "./weather";

function ponto(overrides: Partial<WeatherPoint> = {}): WeatherPoint {
  return {
    latitude: -21.1775,
    longitude: -47.81028,
    data: "2026-07-27",
    tempMinC: 14,
    tempMaxC: 28,
    tempMediaC: 21,
    precipitacaoMm: 0,
    umidadeRelativaMediaPct: 60,
    umidadeRelativaMinPct: 35,
    pontoOrvalhoMedioC: 12,
    evapotranspiracaoMm: 3.5,
    radiacaoSolarMjM2: 18,
    ventoVelocidadeMaxKmh: 8,
    ventoDirecaoDominanteGraus: 90,
    solo: [],
    fonte: "Open-Meteo",
    modelo: "icon_seamless",
    tipo: "previsao",
    ...overrides,
  };
}

const camada = (
  topo: number,
  base: number,
  umidade: number | null,
): SoilLayer => ({
  profundidadeTopoCm: topo,
  profundidadeBaseCm: base,
  umidade,
  temperatura: null,
});

describe("chuvaAcumulada", () => {
  it("soma os dias e informa quantos reportaram", () => {
    const r = chuvaAcumulada([
      ponto({ precipitacaoMm: 5 }),
      ponto({ precipitacaoMm: 0 }),
      ponto({ precipitacaoMm: 12.5 }),
    ]);
    expect(r.mm).toBeCloseTo(17.5, 6);
    expect(r.diasComDado).toBe(3);
  });

  it("não conta dia sem dado como dia sem chuva", () => {
    const r = chuvaAcumulada([ponto({ precipitacaoMm: 10 }), ponto({ precipitacaoMm: null })]);
    expect(r.mm).toBeCloseTo(10, 6);
    expect(r.diasComDado).toBe(1);
  });

  it("é nulo, não zero, quando nenhum dia reportou", () => {
    expect(chuvaAcumulada([ponto({ precipitacaoMm: null })]).mm).toBeNull();
    expect(chuvaAcumulada([]).mm).toBeNull();
  });
});

describe("balancoHidrico", () => {
  it("é chuva menos evapotranspiração", () => {
    const valor = balancoHidrico([
      ponto({ precipitacaoMm: 10, evapotranspiracaoMm: 4 }),
      ponto({ precipitacaoMm: 0, evapotranspiracaoMm: 4 }),
    ]);
    expect(valor).toBeCloseTo(2, 6);
  });

  it("fica negativo quando a perda supera a chuva", () => {
    const valor = balancoHidrico([ponto({ precipitacaoMm: 1, evapotranspiracaoMm: 5 })]);
    expect(valor).toBeCloseTo(-4, 6);
  });

  it("usa só os dias em que ambos são conhecidos", () => {
    // Somar chuva de um dia contra ET0 ausente inflaria o saldo.
    const valor = balancoHidrico([
      ponto({ precipitacaoMm: 10, evapotranspiracaoMm: 4 }),
      ponto({ precipitacaoMm: 30, evapotranspiracaoMm: null }),
    ]);
    expect(valor).toBeCloseTo(6, 6);
  });

  it("é nulo quando nenhum dia tem o par completo", () => {
    expect(balancoHidrico([ponto({ evapotranspiracaoMm: null })])).toBeNull();
  });
});

describe("et0Acumulada", () => {
  it("soma apenas os dias conhecidos", () => {
    const valor = et0Acumulada([
      ponto({ evapotranspiracaoMm: 3 }),
      ponto({ evapotranspiracaoMm: null }),
      ponto({ evapotranspiracaoMm: 4 }),
    ]);
    expect(valor).toBeCloseTo(7, 6);
  });
});

describe("proximaChuva", () => {
  it("acha o primeiro dia acima do limiar", () => {
    const alvo = ponto({ data: "2026-07-30", precipitacaoMm: 8 });
    const achado = proximaChuva([
      ponto({ data: "2026-07-28", precipitacaoMm: 0 }),
      ponto({ data: "2026-07-29", precipitacaoMm: 0.4 }),
      alvo,
    ]);
    expect(achado?.data).toBe("2026-07-30");
  });

  it("ignora garoa abaixo do limiar", () => {
    expect(proximaChuva([ponto({ precipitacaoMm: 0.3 })])).toBeUndefined();
  });
});

describe("diasParaPulverizacao", () => {
  it("aceita o dia calmo, úmido e sem chuva", () => {
    const dias = diasParaPulverizacao([
      ponto({ ventoVelocidadeMaxKmh: 8, umidadeRelativaMediaPct: 62, precipitacaoMm: 0 }),
    ]);
    expect(dias).toHaveLength(1);
  });

  it("recusa vento forte, ar seco ou chuva no dia", () => {
    const dias = diasParaPulverizacao([
      ponto({ ventoVelocidadeMaxKmh: 18 }),
      ponto({ umidadeRelativaMediaPct: 40 }),
      ponto({ precipitacaoMm: 6 }),
    ]);
    expect(dias).toHaveLength(0);
  });

  it("recusa o dia em que falta a medição, em vez de assumir que serve", () => {
    const dias = diasParaPulverizacao([
      ponto({ ventoVelocidadeMaxKmh: null }),
      ponto({ umidadeRelativaMediaPct: null }),
    ]);
    expect(dias).toHaveLength(0);
  });
});

describe("umidadeSoloAtual e horizonteSolo", () => {
  const comSolo = (data: string, umidade: number | null): WeatherPoint =>
    ponto({ data, solo: [camada(0, 7, umidade), camada(7, 28, umidade)] });

  it("usa o primeiro dia que tem leitura", () => {
    expect(umidadeSoloAtual([comSolo("2026-07-27", 0.31)])).toBeCloseTo(0.31, 6);
  });

  it("pula dias sem leitura em vez de devolver nulo cedo demais", () => {
    const valor = umidadeSoloAtual([comSolo("2026-07-27", null), comSolo("2026-07-28", 0.25)]);
    expect(valor).toBeCloseTo(0.25, 6);
  });

  it("aponta o último dia modelado — o horizonte real do solo", () => {
    const horizonte = horizonteSolo([
      comSolo("2026-07-27", 0.3),
      comSolo("2026-08-03", 0.27),
      comSolo("2026-08-04", null),
      comSolo("2026-08-11", null),
    ]);
    expect(horizonte).toBe("2026-08-03");
  });

  it("é nulo quando nenhum dia da janela tem solo", () => {
    expect(umidadeSoloAtual([comSolo("2026-08-10", null)])).toBeNull();
    expect(horizonteSolo([comSolo("2026-08-10", null)])).toBeNull();
  });
});

describe("rosaDosVentos", () => {
  it("converte graus em ponto cardeal em português", () => {
    expect(rosaDosVentos(0)).toBe("N");
    expect(rosaDosVentos(90)).toBe("L");
    expect(rosaDosVentos(180)).toBe("S");
    expect(rosaDosVentos(270)).toBe("O");
  });

  it("fecha o círculo em 360 e aceita valores fora da faixa", () => {
    expect(rosaDosVentos(360)).toBe("N");
    expect(rosaDosVentos(-90)).toBe("O");
    expect(rosaDosVentos(450)).toBe("L");
  });

  it("é travessão quando não há direção", () => {
    expect(rosaDosVentos(null)).toBe("—");
  });
});
