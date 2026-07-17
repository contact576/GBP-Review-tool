"use client";

import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { EmptyState } from "./misc";

/**
 * Premium hairline data-table primitive (Foundly ledger base).
 *
 * - Mono-caps column headers (Spline Sans Mono, tracked).
 * - Zebra-free hairline rows; recessed hover on interactive rows.
 * - Right-aligned tabular numerals for numeric columns.
 * - 12/16px cell padding (px-4 py-3), dense variant available.
 * - Optional sortable headers (controlled) + sticky header.
 * - Horizontal-scroll container so wide tables never scroll the page body.
 * - Built-in empty state from the shared card family (no spinners, no emoji).
 *
 * The API is generic + columns-config driven. Sorting is controlled: pass the
 * current `sort` and handle `onSortChange` however the data layer prefers.
 */

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  /** Stable identifier — also the sort key reported to `onSortChange`. */
  key: string;
  /** Header content (usually a short mono-caps label). */
  header: React.ReactNode;
  /** Cell renderer. Falls back to `accessor`, then `row[key]`. */
  render?: (row: T, index: number) => React.ReactNode;
  /** Simple value accessor when a full renderer is overkill. */
  accessor?: (row: T) => React.ReactNode;
  /** Numeric columns right-align and get tabular numerals automatically. */
  numeric?: boolean;
  /** Explicit alignment (defaults to right for numeric, else left). */
  align?: "left" | "center" | "right";
  /** Enable click-to-sort on this header (requires `onSortChange`). */
  sortable?: boolean;
  /** Fixed column width, e.g. "120px" or "20%". */
  width?: string;
  /** Extra classes on the body cell. */
  cellClassName?: string;
  /** Extra classes on the header cell. */
  headerClassName?: string;
  /** Accessible label for the header when `header` is not plain text. */
  ariaLabel?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Stable React key per row. */
  rowKey: (row: T, index: number) => string | number;
  /** Row click handler — rows become interactive (hover + pointer) when set. */
  onRowClick?: (row: T) => void;
  /** Marks a row as selected (lifts one notch). */
  isRowSelected?: (row: T, index: number) => boolean;
  /** Current sort state (controlled). */
  sort?: { key: string; direction: SortDirection };
  /** Called with the next sort key + direction when a sortable header is hit. */
  onSortChange?: (key: string, direction: SortDirection) => void;
  /** Pin the header while the body scrolls. */
  stickyHeader?: boolean;
  /** Tighter row height for dense admin tables. */
  dense?: boolean;
  /** Visually-hidden-friendly caption for screen readers. */
  caption?: string;
  /** Empty-state overrides (used when `data` is empty). */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: IconName;
  emptyAction?: React.ReactNode;
  /** Fully custom empty render (wins over the empty* props above). */
  empty?: React.ReactNode;
  className?: string;
  /** Classes on the scroll container. */
  containerClassName?: string;
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

function resolveAlign<T>(col: Column<T>): "left" | "center" | "right" {
  if (col.align) return col.align;
  return col.numeric ? "right" : "left";
}

export function Table<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  isRowSelected,
  sort,
  onSortChange,
  stickyHeader,
  dense,
  caption,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon = "file",
  emptyAction,
  empty,
  className,
  containerClassName,
}: TableProps<T>) {
  const cellPad = dense ? "px-4 py-2" : "px-4 py-3";
  const headPad = dense ? "px-4 py-2" : "px-4 py-2.5";
  const isEmpty = data.length === 0;

  function handleSort(col: Column<T>) {
    if (!col.sortable || !onSortChange) return;
    const nextDir: SortDirection =
      sort?.key === col.key && sort.direction === "asc" ? "desc" : "asc";
    onSortChange(col.key, nextDir);
  }

  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-card border border-hairline bg-card",
        containerClassName,
      )}
    >
      <table className={cn("w-full border-collapse text-[14px]", className)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((col) => {
              const align = resolveAlign(col);
              const active = sort?.key === col.key;
              const sortIcon: IconName | null = col.sortable
                ? active
                  ? sort?.direction === "asc"
                    ? "arrow-up"
                    : "arrow-down"
                  : null
                : null;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortable
                      ? active
                        ? sort?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    headPad,
                    "font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-faint whitespace-nowrap",
                    stickyHeader && "sticky top-0 z-10 bg-card",
                    alignClass[align],
                    col.headerClassName,
                  )}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      aria-label={col.ariaLabel}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        active && "text-ink",
                        align === "right" && "flex-row-reverse",
                      )}
                    >
                      <span>{col.header}</span>
                      {sortIcon ? (
                        <Icon name={sortIcon} size={12} aria-hidden />
                      ) : (
                        <Icon name="arrow-down" size={12} className="opacity-25" aria-hidden />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? (
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                )}
              </td>
            </tr>
          ) : (
            data.map((row, i) => {
              const selected = isRowSelected?.(row, i) ?? false;
              const interactive = Boolean(onRowClick);
              return (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={selected || undefined}
                  className={cn(
                    "border-b border-hairline last:border-0 transition-colors",
                    interactive && "cursor-pointer hover:bg-primary-wash",
                    selected && "bg-primary-wash",
                  )}
                >
                  {columns.map((col) => {
                    const align = resolveAlign(col);
                    const content = col.render
                      ? col.render(row, i)
                      : col.accessor
                        ? col.accessor(row)
                        : ((row as Record<string, unknown>)[col.key] as React.ReactNode);
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          cellPad,
                          "text-ink align-middle",
                          alignClass[align],
                          col.numeric && "tabular-nums",
                          col.cellClassName,
                        )}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
