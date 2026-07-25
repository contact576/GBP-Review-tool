"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/utils/format";
import type { AeoQuota } from "@/lib/aeo/metering";

interface RunResponse {
  ok?: boolean;
  persisted?: boolean;
  error?: string;
  blockers?: string[];
  quota?: AeoQuota;
  run?: { checked?: number; notChecked?: number; named?: number; results?: unknown[] };
}

type Tone = "ok" | "warn" | "error";

/**
 * The "Run check" control.
 *
 * Everything the button costs is stated before it is pressed: how many
 * questions get asked, how many runs remain this month, and — when no AI
 * provider is connected — that a run would produce no verdicts at all, so the
 * button is disabled rather than burning a run on nothing.
 */
export function RunCheck({
  queries,
  blockers,
  quota,
  providerConfigured,
  demoWorkspace,
}: {
  queries: string[];
  blockers: string[];
  quota: AeoQuota;
  providerConfigured: boolean;
  demoWorkspace: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  const outOfQuota = quota.remaining <= 0;
  const noQueries = queries.length === 0;
  const blocked = outOfQuota || noQueries || !providerConfigured || demoWorkspace;

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/aeo/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as RunResponse;
      if (!response.ok) {
        setMessage({ tone: "error", text: errorCopy(payload, quota) });
        return;
      }
      setMessage({ tone: payload.persisted === false ? "warn" : "ok", text: successCopy(payload) });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "The check could not be started. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card raised>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="kicker mb-1.5">New AI Visibility check</div>
          <h2 className="text-[18px] font-bold text-ink">Ask an AI assistant these questions</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-sub">
            Each question is sent to one AI assistant once, and its answer is read for whether your
            business name appears in it. One question is one model call — this is a paid API call,
            not a free lookup.
          </p>
        </div>
        <div className="shrink-0 text-left lg:text-right">
          <div className="data-chip text-faint">
            <span className="tabular-nums">{quota.used}</span> of{" "}
            <span className="tabular-nums">{quota.limit}</span> checks used this month
          </div>
          <div className="mt-1 text-[12px] text-faint">
            Resets {formatDate(quota.resetsOn)}
          </div>
        </div>
      </div>

      {queries.length > 0 ? (
        <div className="mt-4 rounded-btn border border-hairline bg-primary-wash/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon name="search" size={13} /> This run will ask{" "}
            <span className="tabular-nums">{queries.length}</span> questions
          </div>
          <ul className="space-y-1">
            {queries.map((query) => (
              <li key={query} className="text-[13px] text-sub">
                &ldquo;{query}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {blockers.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {blockers.map((blocker) => (
            <li key={blocker} className="flex items-start gap-1.5 text-[13px] text-gold-deep">
              <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
              {blocker}
            </li>
          ))}
        </ul>
      ) : null}

      {!providerConfigured ? (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] text-gold-deep">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          No AI provider is connected on this deployment, so a check would report every question as
          not checked. Nothing is estimated in the meantime.
        </p>
      ) : null}

      {demoWorkspace ? (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] text-gold-deep">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          This is the demo workspace, which shows a saved sample rather than spending live API
          calls. Run a real check from your own workspace.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button icon="sparkles" onClick={run} loading={pending} disabled={blocked}>
          {pending ? "Asking the assistant…" : "Run check"}
        </Button>
        {pending ? (
          <span role="status" className="flex items-center gap-1.5 text-[13px] text-sub">
            <Icon name="clock" size={14} />
            Asking <span className="tabular-nums">{queries.length}</span> questions — this takes a
            few seconds per question.
          </span>
        ) : null}
        {!pending && outOfQuota ? (
          <Badge tone="gold" icon="lock">
            Monthly checks used
          </Badge>
        ) : null}
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-3 rounded-btn border px-3 py-2 text-[13px] font-medium ${toneClass(message.tone)}`}
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}

function toneClass(tone: Tone): string {
  if (tone === "ok") return "border-primary/25 bg-primary-wash text-primary-dark";
  if (tone === "warn") return "border-gold/40 bg-gold-tint/60 text-gold-deep";
  return "border-danger/25 bg-danger-tint text-danger";
}

function successCopy(payload: RunResponse): string {
  const checked = payload.run?.checked ?? 0;
  const notChecked = payload.run?.notChecked ?? 0;
  const named = payload.run?.named ?? 0;
  const parts: string[] = [];
  if (checked > 0) {
    parts.push(`Checked ${checked} ${checked === 1 ? "question" : "questions"} — named in ${named}.`);
  } else {
    parts.push("No question could be checked in this run.");
  }
  if (notChecked > 0) {
    parts.push(
      `${notChecked} ${notChecked === 1 ? "question" : "questions"} could not be checked and ${notChecked === 1 ? "is" : "are"} reported as such, not as "not named".`,
    );
  }
  if (payload.persisted === false) {
    parts.push("This run finished but could not be saved, so it may disappear when you reload.");
  }
  return parts.join(" ");
}

function errorCopy(payload: RunResponse, quota: AeoQuota): string {
  switch (payload.error) {
    case "rate_limited":
      return "Too many checks started in the last minute. Wait a moment, then try again.";
    case "quota_exceeded":
      return `All ${quota.limit} checks for this month are used. The counter resets ${formatDate(payload.quota?.resetsOn ?? quota.resetsOn)}.`;
    case "upgrade_required":
      return "AI Visibility checks are included with Pro. Upgrade to run one.";
    case "demo_workspace":
      return "The demo workspace shows a saved sample. Run a live check from a real workspace.";
    case "no_queries":
      return payload.blockers?.join(" ") ?? "There isn't enough profile detail yet to write questions.";
    case "unauthorized":
    case "forbidden":
      return "You need owner or manager access to run a check.";
    case "forbidden_origin":
      return "That request was blocked. Reload the page and try again.";
    default:
      return "The check could not be completed. Nothing was recorded.";
  }
}
