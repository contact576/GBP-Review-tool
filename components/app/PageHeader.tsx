import { cn } from "@/lib/utils/cn";

/**
 * The one page-title pattern for every authed surface (owner, agency, admin).
 * Standardizes the H1 scale (blueprint §10.2: H1 26–32) and the title→subtitle
 * rhythm so areas stop drifting (owner was 24–28, admin 22, agency had none).
 */
export function PageHeader({
  title,
  sub,
  kicker,
  actions,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  kicker?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker ? <div className="kicker mb-1">{kicker}</div> : null}
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink lg:text-[30px]">
          {title}
        </h1>
        {sub ? <p className="mt-1 text-[15px] text-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
