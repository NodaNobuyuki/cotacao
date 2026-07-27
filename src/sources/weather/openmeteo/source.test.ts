import { describe, expect, it, vi, type Mock } from "vitest";
import { OpenMeteoError, OpenMeteoSource } from "./source";

type FetchMock = Mock<(input: string) => Promise<Response>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A fetch mock that mints a *fresh* Response per call. A Response body can only
 * be read once, so handing the same object to two calls makes the second fail
 * with "Body has already been read" — which the source then dutifully retries.
 */
function respondWith(body: unknown, status = 200): FetchMock {
  return vi.fn((_input: string) => Promise.resolve(jsonResponse(body, status)));
}

/** The source only ever calls fetch with a string URL, so that is the shape mocked. */
function asFetch(mock: FetchMock): typeof fetch {
  return mock as unknown as typeof fetch;
}

const MINIMAL = {
  latitude: -21.1775,
  longitude: -47.81028,
  daily: { time: ["2026-07-27"], temperature_2m_max: [28.4] },
};

/** Silences the source's logger so retry tests do not spam the reporter. */
const quiet = { logger: (): void => {}, maxRetries: 2 };

describe("OpenMeteoSource — construção da URL", () => {
  it("requests soil and ET₀ explicitly, not a generic forecast", async () => {
    const fetchImpl = respondWith(MINIMAL);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await source.getForecast(-21.1775, -47.81028, 7);

    const url = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("daily")).toContain("et0_fao_evapotranspiration");
    expect(url.searchParams.get("hourly")).toContain("soil_moisture_0_to_1cm");
    expect(url.searchParams.get("forecast_days")).toBe("7");
    expect(url.searchParams.get("timezone")).toBe("America/Sao_Paulo");
  });

  it("uses the archive endpoint and ERA5 soil bands for history", async () => {
    const fetchImpl = respondWith(MINIMAL);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await source.getHistorical(-21.1775, -47.81028, "2026-06-01", "2026-06-30");

    const url = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://archive-api.open-meteo.com/v1/archive",
    );
    expect(url.searchParams.get("start_date")).toBe("2026-06-01");
    expect(url.searchParams.get("end_date")).toBe("2026-06-30");
    // ERA5's grid, not ICON's — the two are genuinely different depths.
    expect(url.searchParams.get("hourly")).toContain("soil_moisture_0_to_7cm");
    expect(url.searchParams.get("hourly")).not.toContain("soil_moisture_0_to_1cm");
  });

  it("tags each point with the model that produced it", async () => {
    const fetchImpl = respondWith(MINIMAL);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    const forecast = await source.getForecast(-21.1775, -47.81028, 3);
    const history = await source.getHistorical(-21.1775, -47.81028, "2026-06-01", "2026-06-02");

    expect(forecast[0]?.modelo).toBe("icon_seamless");
    expect(history[0]?.modelo).toBe("era5");
  });

  it("caps forecast_days at the API's 16-day limit", async () => {
    const fetchImpl = respondWith(MINIMAL);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await source.getForecast(-21.1775, -47.81028, 90);

    const url = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get("forecast_days")).toBe("16");
  });
});

describe("OpenMeteoSource — validação", () => {
  const source = new OpenMeteoSource({
    ...quiet,
    fetchImpl: asFetch(respondWith(MINIMAL)),
  });

  it("rejects coordinates outside the globe before spending a request", async () => {
    await expect(source.getForecast(120, 0, 7)).rejects.toThrow(OpenMeteoError);
    await expect(source.getForecast(0, 200, 7)).rejects.toThrow(OpenMeteoError);
    await expect(source.getForecast(Number.NaN, 0, 7)).rejects.toThrow(OpenMeteoError);
  });

  it("rejects malformed and inverted date ranges", async () => {
    await expect(source.getHistorical(0, 0, "01/06/2026", "2026-06-30")).rejects.toThrow(
      /YYYY-MM-DD/,
    );
    await expect(source.getHistorical(0, 0, "2026-06-30", "2026-06-01")).rejects.toThrow(
      /invertido/,
    );
  });
});

describe("OpenMeteoSource — resiliência", () => {
  it("retries a network fault and succeeds on a later attempt", async () => {
    const fetchImpl: FetchMock = vi
      .fn((_input: string) => Promise.resolve(jsonResponse(MINIMAL)))
      .mockRejectedValueOnce(new Error("ECONNRESET"));
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    const points = await source.getForecast(-21.1775, -47.81028, 3);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(points).toHaveLength(1);
  });

  it("does not retry a 400 — the query is wrong and will stay wrong", async () => {
    const fetchImpl = respondWith({ error: true, reason: "Cannot initialize WeatherVariable" }, 400);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await expect(source.getForecast(-21.1775, -47.81028, 3)).rejects.toThrow(
      /Cannot initialize WeatherVariable/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries, naming the last fault", async () => {
    const fetchImpl: FetchMock = vi
      .fn((_input: string) => Promise.resolve(jsonResponse(MINIMAL)))
      .mockRejectedValue(new Error("ETIMEDOUT"));
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await expect(source.getForecast(-21.1775, -47.81028, 3)).rejects.toThrow(/ETIMEDOUT/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("keeps the surviving locations when one coordinate fails in a batch", async () => {
    const fetchImpl: FetchMock = vi.fn((url: string) =>
      url.includes("-51.1") // Londrina
        ? Promise.reject(new Error("ECONNRESET"))
        : Promise.resolve(jsonResponse(MINIMAL)),
    );
    const source = new OpenMeteoSource({ ...quiet, maxRetries: 0, fetchImpl: asFetch(fetchImpl) });

    const results = await source.fetchMany(
      [
        { id: "ribeirao-preto", lat: -21.1775, lon: -47.81028 },
        { id: "londrina", lat: -23.31028, lon: -51.16278 },
        { id: "maringa", lat: -23.42528, lon: -51.93861 },
      ],
      3,
    );

    expect([...results.keys()]).toEqual(["ribeirao-preto", "maringa"]);
  });
});

describe("OpenMeteoSource — cache", () => {
  it("serves an identical query from memory instead of re-fetching", async () => {
    const fetchImpl = respondWith(MINIMAL);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await source.getForecast(-21.1775, -47.81028, 7);
    await source.getForecast(-21.1775, -47.81028, 7);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats a different location as a different query", async () => {
    const fetchImpl = respondWith(MINIMAL);
    const source = new OpenMeteoSource({ ...quiet, fetchImpl: asFetch(fetchImpl) });

    await source.getForecast(-21.1775, -47.81028, 7);
    await source.getForecast(-23.31028, -51.16278, 7);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("expires entries once the TTL has passed", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = respondWith(MINIMAL);
      const source = new OpenMeteoSource({
        ...quiet,
        forecastTtlMs: 1_000,
        historicalTtlMs: 1_000,
        fetchImpl: asFetch(fetchImpl),
      });

      await source.getForecast(-21.1775, -47.81028, 7);
      vi.advanceTimersByTime(1_500);
      await source.getForecast(-21.1775, -47.81028, 7);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
