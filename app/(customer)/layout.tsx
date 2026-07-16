import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

/** Small, restrained trust badge shown on every customer surface. */
function FoundlyBadge() {
  return (
    <footer className="flex justify-center py-5">
      <span className="inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-faint shadow-sm">
        <span className="grid size-4 place-items-center rounded-[5px] bg-hero text-gold">
          <Icon name="sparkles" size={10} />
        </span>
        {MICROCOPY.poweredByFoundly}
      </span>
    </footer>
  );
}

/**
 * Customer surfaces are phone-first: a warm-paper canvas, a single narrow column,
 * and the Foundly trust badge fixed to the foot of every state.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto flex min-h-dvh max-w-[440px] flex-col px-4">
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <FoundlyBadge />
      </div>
    </div>
  );
}
