"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { RegionMeta } from "@/db/queries";
import { buildCropHref, buildHref, type CropDetailParams, type DashboardParams } from "@/lib/params";
import { SELECT_CLASS } from "./field-styles";

/**
 * The one control that genuinely needs client JavaScript: a <select> cannot be
 * a link. It navigates on change and shows the pending state while the server
 * re-renders, so a slow query never looks like a dead click.
 *
 * A closure built on the server (e.g. `(region) => ...`) cannot be passed as a
 * prop into a Client Component -- functions aren't serialisable across the
 * RSC boundary. So instead of an `hrefFor` callback prop, this takes plain
 * (serialisable) params and calls `buildHref`/`buildCropHref` itself, which
 * are pure functions statically imported into this client module.
 */
export function RegionSelect(
  props:
    | { regions: RegionMeta[]; params: DashboardParams; cropId?: undefined }
    | { regions: RegionMeta[]; params: CropDetailParams; cropId: string },
) {
  const { regions, params, cropId } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-[3px] sm:flex-none">
      <span className="text-[10.5px] uppercase tracking-[0.07em] text-ink-faint">
        Praça de negociação
      </span>
      <select
        value={params.region}
        disabled={pending}
        onChange={(e) => {
          const region = e.target.value;
          const href = cropId
            ? buildCropHref(cropId, params, { region })
            : buildHref(params as DashboardParams, { region });
          startTransition(() => router.push(href));
        }}
        className={`${SELECT_CLASS} sm:min-w-[180px]`}
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
