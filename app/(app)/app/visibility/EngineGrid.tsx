import { Icon } from "@/components/icons";
import type { AeoCellState, AeoMatrixRow, AeoEngineOutcome } from "@/lib/aeo/multi";

/**
 * The question × engine grid — the core of a multi-engine report.
 *
 * Four cell states, each drawn differently and each labelled in the legend,
 * because they are four different facts:
 *
 *   named          the engine's answer contained the business (with position)
 *   not named      the engine answered and the business was not in it
 *   not checked    the engine was asked but produced no usable answer
 *   not connected  the engine was never asked — no API key on this deployment
 *
 * "Not checked" and "not connected" are deliberately drawn hollow and grey so
 * they can never be read as the red of "not named".
 */
export function EngineGrid({
  engines,
  rows,
}: {
  engines: AeoEngineOutcome[];
  rows: AeoMatrixRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">Which AI engines named the business, by question</caption>
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-faint">
              Question
            </th>
            {engines.map((engine) => (
              <th
                key={engine.engineId}
                scope="col"
                className="px-1.5 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint"
              >
                <span className="inline-flex flex-col items-center gap-0.5">
                  <span className="whitespace-nowrap">{engine.productName}</span>
                  {engine.state === "not_connected" ? (
                    <span className="text-[10px] font-medium normal-case tracking-normal text-faint">not connected</span>
                  ) : null}
                </span>
              </th>
            ))}
            <th scope="col" className="py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wide text-faint whitespace-nowrap">
              Engines naming you
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((row) => (
            <tr key={row.query}>
              <th scope="row" className="max-w-[320px] py-2.5 pr-3 text-left font-semibold text-ink">
                &ldquo;{row.query}&rdquo;
              </th>
              {row.cells.map((cell) => (
                <td key={cell.engineId} className="px-1.5 py-2.5 text-center">
                  <Cell state={cell.state} position={cell.position} note={cell.note} />
                </td>
              ))}
              <td className="py-2.5 pl-3 text-right tabular-nums text-sub whitespace-nowrap">
                {row.checkedOn > 0 ? (
                  <>
                    <span className={row.namedOn === row.checkedOn ? "font-bold text-primary-dark" : "font-semibold text-ink"}>
                      {row.namedOn}
                    </span>
                    <span className="text-faint"> / {row.checkedOn}</span>
                  </>
                ) : (
                  <span className="text-faint">not checked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-3 text-[12px] text-sub">
        <LegendItem state="named" label="Named, with position in the answer" />
        <LegendItem state="not_named" label="Answered, not named" />
        <LegendItem state="not_checked" label="Asked, no usable answer" />
        <LegendItem state="not_connected" label="Not asked — engine not connected" />
      </dl>
    </div>
  );
}

function Cell({ state, position, note }: { state: AeoCellState; position: number | null; note: string | null }) {
  const base = "inline-flex min-w-9 items-center justify-center gap-1 rounded-chip px-2 py-1 text-[12px] font-bold tabular-nums";
  switch (state) {
    case "named":
      return (
        <span className={`${base} bg-primary text-white`} title="Named in this engine's answer">
          <Icon name="check" size={12} />
          {typeof position === "number" ? `#${position}` : ""}
        </span>
      );
    case "not_named":
      return (
        <span className={`${base} bg-danger-tint text-danger`} title="Answered, and the business was not named">
          <Icon name="x" size={12} />
        </span>
      );
    case "not_checked":
      return (
        <span
          className={`${base} border border-hairline bg-card text-faint`}
          title={note ? `Not checked — ${note}` : "Not checked"}
        >
          ?
        </span>
      );
    case "not_connected":
      return (
        <span
          className={`${base} border border-dashed border-hairline bg-paper text-faint`}
          title={note ? `Not asked — ${note}` : "Not asked"}
        >
          ·
        </span>
      );
  }
}

function LegendItem({ state, label }: { state: AeoCellState; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt>
        <Cell state={state} position={state === "named" ? 1 : null} note={null} />
      </dt>
      <dd>{label}</dd>
    </div>
  );
}
