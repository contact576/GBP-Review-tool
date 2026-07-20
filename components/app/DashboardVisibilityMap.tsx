import { Icon } from "@/components/icons";
import type { RankGridScan } from "@/lib/data/types";

function pointStyle(rank: number | null) {
  if (rank !== null && rank <= 3) return "border-[#FFFFFF] bg-primary-dark text-white";
  if (rank !== null && rank <= 10) return "border-[#FFFFFF] bg-[#72A991] text-white";
  if (rank !== null) return "border-[#FFFFFF] bg-gold text-ink";
  return "border-[#FFFFFF] bg-faint text-white";
}

export function DashboardVisibilityMap({ scan }: { scan?: RankGridScan }) {
  if (!scan) {
    return (
      <div className="dashboard-map-texture grid h-full min-h-[190px] place-items-center rounded-[9px] border border-hairline">
        <div className="max-w-[210px] text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-card text-primary shadow-sm">
            <Icon name="map-pin" size={19} />
          </span>
          <p className="mt-3 text-[12px] font-bold text-ink">Run your first local rank scan</p>
          <p className="mt-1 text-[11px] leading-relaxed text-sub">Your neighborhood visibility will appear here.</p>
        </div>
      </div>
    );
  }

  const denominator = Math.max(1, scan.gridSize - 1);

  return (
    <div className="dashboard-map-texture relative h-full min-h-[190px] overflow-hidden rounded-[9px] border border-hairline" aria-label={`Rank grid for ${scan.keyword}`}>
      <div className="absolute left-[8%] top-[13%] text-[9px] font-semibold tracking-wide text-primary-dark/35">RIVERSIDE</div>
      <div className="absolute bottom-[12%] right-[7%] text-[9px] font-semibold tracking-wide text-primary-dark/35">EAST END</div>
      <div className="absolute left-1/2 top-1/2 h-[140%] w-3 -translate-x-1/2 -translate-y-1/2 rotate-[33deg] bg-white/60 shadow-[0_0_0_1px_rgba(23,32,29,.035)]" />
      <div className="absolute left-1/2 top-1/2 h-3 w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] bg-white/55 shadow-[0_0_0_1px_rgba(23,32,29,.035)]" />

      {scan.points.map((point) => (
        <span
          key={`${point.row}-${point.col}`}
          title={point.rank === null ? "Outside tracked range" : `Rank ${point.rank}`}
          className={`absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[9px] font-extrabold shadow-sm ${pointStyle(point.rank)}`}
          style={{
            left: `${8 + (point.col / denominator) * 84}%`,
            top: `${9 + (point.row / denominator) * 82}%`,
          }}
        >
          {point.rank ?? "–"}
        </span>
      ))}

      <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[8px] border-2 border-white bg-gold text-ink shadow-lg" title="Your business">
        <Icon name="building" size={15} />
      </span>
    </div>
  );
}
