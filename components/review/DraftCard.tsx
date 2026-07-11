"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";

/** An editable AI draft card with tone tag + regenerate. */
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
      className={cn(
        "rounded-card border bg-card p-4 transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-hairline",
      )}
      onClick={onSelect}
    >
      <div className="mb-2 flex items-center justify-between">
        <Badge tone="primary">{tone}</Badge>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Edit draft"
            onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
            className="grid size-8 place-items-center rounded-btn text-sub hover:bg-primary-wash"
          >
            <Icon name="pencil" size={16} />
          </button>
          {onRegenerate ? (
            <button
              type="button"
              aria-label="Regenerate draft"
              onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
              className="grid size-8 place-items-center rounded-btn text-sub hover:bg-primary-wash"
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
