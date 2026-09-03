"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Chip } from "@/components/ds";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import {
  AEO_QUESTION_LIMIT,
  MAX_OWNER_SERVICES,
  MAX_SERVICE_LENGTH,
  REVIEW_PICKER_LIMIT,
  cleanServiceValue,
  normalizeOwnerServices,
  ownerServicesProblem,
} from "@/components/app/business-services";
import { updateBusinessServicesAction } from "@/lib/actions";

interface Row {
  id: number;
  value: string;
}

function toRows(values: readonly string[], startId = 0): Row[] {
  return values.map((value, index) => ({ id: startId + index, value }));
}

/**
 * Editor for the owner's own service list.
 *
 * Everything typed here stays local until Save: the catalog suggestion chips
 * only fill a row, they never persist anything on the owner's behalf. The same
 * `normalizeOwnerServices` rules the server action enforces run on every
 * keystroke, so the count and the blocking message shown here are the ones the
 * save will actually apply.
 */
export function BusinessServicesForm({
  savedServices,
  suggestions,
  industryLabel,
  googleSuppliesServices,
}: {
  /** What is stored today. Empty means the owner has saved nothing. */
  savedServices: string[];
  /** Typical services for the industry the owner picked. Never auto-saved. */
  suggestions: string[];
  industryLabel: string;
  /** True when the synced Google profile already lists services of its own. */
  googleSuppliesServices: boolean;
}) {
  const [saved, setSaved] = useState<string[]>(savedServices);
  const [rows, setRows] = useState<Row[]>(() =>
    savedServices.length > 0 ? toRows(savedServices) : [{ id: 0, value: "" }],
  );
  const nextId = useRef(Math.max(savedServices.length, 1));
  const lastInput = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const normalized = useMemo(
    () => normalizeOwnerServices(rows.map((row) => row.value)),
    [rows],
  );
  const problem = ownerServicesProblem(normalized);
  const dirty =
    normalized.services.length !== saved.length ||
    normalized.services.some((value, index) => value !== saved[index]);
  const taken = useMemo(
    () => new Set(rows.map((row) => cleanServiceValue(row.value).toLowerCase())),
    [rows],
  );
  const openSuggestions = suggestions.filter(
    (suggestion) => !taken.has(suggestion.trim().toLowerCase()),
  );
  const atMax = rows.length >= MAX_OWNER_SERVICES;

  function addRow(value = "") {
    if (rows.length >= MAX_OWNER_SERVICES) return;
    const id = nextId.current;
    nextId.current += 1;
    setRows((current) => [...current, { id, value }]);
    if (value === "") {
      // Focus lands after the new row paints.
      window.requestAnimationFrame(() => lastInput.current?.focus());
    }
  }

  function setValue(id: number, value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, value } : row)));
  }

  function removeRow(id: number) {
    const blankId = nextId.current;
    nextId.current += 1;
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length > 0 ? next : [{ id: blankId, value: "" }];
    });
  }

  function discard() {
    setRows(
      saved.length > 0
        ? toRows(saved, nextId.current)
        : [{ id: nextId.current, value: "" }],
    );
    nextId.current += Math.max(saved.length, 1);
  }

  function save() {
    if (problem) return;
    startTransition(async () => {
      const result = await updateBusinessServicesAction(normalized.services);
      toast(result.message, result.ok ? "success" : "danger", result.ok ? "check-circle" : "alert");
      if (!result.ok) return;
      setSaved(result.services);
      setRows(
        result.services.length > 0
          ? toRows(result.services, nextId.current)
          : [{ id: nextId.current, value: "" }],
      );
      nextId.current += Math.max(result.services.length, 1);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-ink">Your services</span>
        <span className="text-[12px] font-semibold tabular-nums text-sub">
          {normalized.services.length} of {MAX_OWNER_SERVICES}
        </span>
      </div>

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-2">
            <input
              ref={index === rows.length - 1 ? lastInput : undefined}
              type="text"
              value={row.value}
              onChange={(event) => setValue(row.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addRow();
                }
              }}
              maxLength={MAX_SERVICE_LENGTH + 20}
              disabled={pending}
              aria-label={`Service ${index + 1}`}
              placeholder="e.g. the name a customer would use"
              className="h-11 min-h-[44px] w-full rounded-input border border-hairline bg-card px-3.5 text-[15px] text-ink placeholder:text-faint transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="x"
              disabled={pending}
              onClick={() => removeRow(row.id)}
              aria-label={`Remove ${cleanServiceValue(row.value) || `service ${index + 1}`}`}
              className="shrink-0 px-2"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon="plus"
          disabled={pending || atMax}
          onClick={() => addRow()}
        >
          Add service
        </Button>
        {atMax ? (
          <span className="text-[12px] text-sub">
            That is the most this product can show. Remove one to add another.
          </span>
        ) : null}
      </div>

      {openSuggestions.length > 0 ? (
        <div className="rounded-card border border-hairline bg-primary-wash/40 p-3.5">
          <div className="flex items-start gap-2">
            <Icon name="sparkles" size={16} className="mt-0.5 shrink-0 text-sub" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink">
                Typical for {industryLabel}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-sub">
                Catalog examples, not your list. Tapping one fills a row — nothing is
                stored until you save.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {openSuggestions.map((suggestion) => (
              <Chip
                key={suggestion}
                icon="plus"
                disabled={pending || atMax}
                onClick={() => addRow(suggestion)}
              >
                {suggestion}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {problem ? (
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-danger" role="alert">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {problem}
        </p>
      ) : (
        <p className="text-[12px] leading-relaxed text-sub">
          {googleSuppliesServices
            ? "Your Google profile's own services come first on the review page, and AI Visibility reads only those. Repeats are removed on save."
            : `The first ${REVIEW_PICKER_LIMIT} appear on your review page; the first ${AEO_QUESTION_LIMIT} build the AI Visibility questions. Repeats are removed on save.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          icon="check"
          loading={pending}
          disabled={pending || !dirty || Boolean(problem)}
          onClick={save}
        >
          {pending ? "Saving" : "Save services"}
        </Button>
        {dirty && !pending ? (
          <Button type="button" size="sm" variant="ghost" onClick={discard}>
            Discard changes
          </Button>
        ) : null}
      </div>
    </div>
  );
}
