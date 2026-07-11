import { cn } from "@/lib/utils/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  raised?: boolean;
  as?: "div" | "section" | "article";
}

export function Card({ padded = true, raised, as = "div", className, children, ...props }: CardProps) {
  const Comp = as;
  return (
    <Comp
      className={cn(
        "bg-card rounded-card border border-hairline",
        raised ? "shadow-lg" : "shadow-sm",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({
  title,
  kicker,
  action,
  className,
}: {
  title: React.ReactNode;
  kicker?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-4", className)}>
      <div>
        {kicker ? <div className="kicker mb-1">{kicker}</div> : null}
        <h2 className="text-[17px] font-bold text-ink leading-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}
