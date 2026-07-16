"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";

/** An editable, selectable AI draft card with tone tag + regenerate. */
export function DraftCard({
  text, tone, selected, onSelect, onEdit, onRegenerate, regenerating,
}: {
  text: string;
  tone: string;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: (v: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        "cursor-pointer rounded-card border bg-card p-4 transition-all duration-150 focus-visible:outline-none",
        selected
          ? "border-primary shadow-lg ring-2 ring-primary/20"
          : "border-hairline shadow-sm hover:border-primary/40",
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full border transition-colors",
              selected ? "border-primary bg-primary text-white" : "border-hairline text-transparent",
            )}
            aria-hidden
          >
            <Icon name="check" size={12} />
          </span>
          <Badge tone={selected ? "primary" : "neutral"}>{tone}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Edit draft"
            onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); onSelect?.(); }}
            className={cn(
              "grid size-9 place-items-center rounded-btn text-sub transition-colors hover:bg-primary-wash hover:text-ink",
              editing && "bg-primary-wash text-primary",
            )}
          >
            <Icon name="pencil" size={16} />
          </button>
          {onRegenerate ? (
            <button
              type="button"
              aria-label="Regenerate this wording"
              onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
              className="grid size-9 place-items-center rounded-btn text-sub transition-colors hover:bg-primary-wash hover:text-ink"
            >
              <Icon name="refresh" size={16} className={regenerating ? "animate-spin" : ""} />
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => onEdit?.(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full resize-y rounded-input border border-hairline bg-paper px-3 py-2 text-[14px] leading-relaxed text-ink focus-visible:border-primary focus-visible:outline-none"
          rows={4}
          autoFocus
        />
      ) : (
        <p className="text-[14px] leading-relaxed text-ink">{text}</p>
      )}
    </div>
  );
}
