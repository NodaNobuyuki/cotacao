import Link from "next/link";

/**
 * Switches between the two arms of the product: prices and weather.
 *
 * These are real routes, not a client-side tab. The arms answer different
 * questions from different sources and are keyed on different things — a praça
 * for prices, a coordinate for weather — so pretending they are one page with a
 * filter would put two unrelated sets of controls on screen at once, which is
 * exactly the confusion this is meant to prevent.
 *
 * Being routes also means the weather page runs no price query and ships no
 * price chart, and vice versa.
 */
export function ArmSwitch({ active }: { active: "precos" | "clima" }) {
  const arms = [
    { id: "precos", label: "Preços", href: "/" },
    { id: "clima", label: "Clima", href: "/clima" },
  ] as const;

  return (
    <nav
      aria-label="Área do painel"
      className="inline-flex gap-0.5 rounded-[11px] bg-segment p-[3px]"
    >
      {arms.map((arm) => {
        const isActive = arm.id === active;
        return (
          <Link
            key={arm.id}
            href={arm.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              // 40px tall on touch, back to the compact desktop height at sm.
              "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg px-[15px] text-[12.5px] transition-all sm:min-h-0 sm:py-1.5",
              isActive
                ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                : "font-medium text-ink-muted hover:text-ink",
            ].join(" ")}
          >
            {arm.label}
          </Link>
        );
      })}
    </nav>
  );
}
