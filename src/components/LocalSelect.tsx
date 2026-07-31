"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCAIS } from "@/sources/weather";
import { buildWeatherHref, type WeatherParams } from "@/lib/weather-params";
import { SELECT_CLASS } from "./field-styles";

/**
 * Location picker for the weather arm. Like RegionSelect, this is one of the
 * few controls that genuinely needs client JavaScript — a <select> cannot be a
 * link — and it takes serialisable params rather than an href callback, since
 * functions do not cross the RSC boundary.
 *
 * Grouped by UF purely so a sixteen-item list stays scannable. The groups are
 * not trading regions: picking Londrina says nothing about which praça the
 * user is watching on the price side, and nothing here implies otherwise.
 */
export function LocalSelect({ params }: { params: WeatherParams }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const ufs = [...new Set(LOCAIS.map((l) => l.uf))];

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-[3px] sm:flex-none">
      <span className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
        Local
      </span>
      <select
        value={params.local.id}
        disabled={pending}
        onChange={(e) => {
          const href = buildWeatherHref(params, { local: e.target.value });
          startTransition(() => router.push(href));
        }}
        className={`${SELECT_CLASS} sm:min-w-[200px]`}
      >
        {ufs.map((uf) => (
          <optgroup key={uf} label={uf === "SP" ? "São Paulo" : "Paraná"}>
            {LOCAIS.filter((l) => l.uf === uf).map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
