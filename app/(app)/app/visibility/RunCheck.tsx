"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/utils/format";
import { upgradeFor } from "@/lib/billing/plans";
import type { AeoQuota } from "@/lib/aeo/metering";
import { blockerSentence, type AeoBlocker } from "@/lib/aeo/queries";

/**
 * The lowest plan that actually carries `ai_visibility`, read from the plan
 * catalog rather than typed into copy. "Pro" was folded into Growth
 * (`LEGACY_PLAN_ALIASES` in lib/billing/plans.ts) and the naming here drifted
 * behind it; deriving it means it cannot drift again.
 */
const VISIBILITY_PLAN_NAME = upgradeFor("ai_visibility").name;

interface RunResponse {
  ok?: boolean;
  persisted?: boolean;
  error?: string;
  /** The exact questions the run sent to the model. Authoritative. */
  asked?: string[];
  blockers?: AeoBlocker[];
  quota?: AeoQuota;
  run?: { checked?: number; notChecked?: number; named?: number; results?: unknown[] };
}

/** GET /api/aeo/run — the plan recomputed server-side, no model call. */
interface PlanResponse {
  ok?: boolean;
  queries?: string[];
  blockers?: AeoBlocker[];
}

type Tone = "ok" | "warn" | "error";

interface Plan {
  queries: string[];
  blockers: AeoBlocker[];
}

/** What one completed run asked, next to what was on screen when it started. */
interface LastRun {
  asked: string[];
  previewed: string[];
}

/**
 * The "Run check" control.
 *
 * Everything the button costs is stated before it is pressed: how many
 * questions get asked, how many runs remain this month, and — when no AI
 * provider is connected — that a run would produce no verdicts at all, so the
 * button is disabled rather than burning a run on nothing.
 *
 * The question set is never sent from here. The server derives it from the
 * workspace's own profile (see app/api/aeo/run/route.ts), which is what stops
 * this metered endpoint being an open relay to the model. The cost of that: the
 * list rendered here is a PREVIEW recomputed independently, and a profile edit
 * between render and click can move it. So two things close the gap rather than
 * trusting the preview — it is refreshed from the server immediately before the
 * run, and the run reports back the questions it actually asked, which are what
 * gets rendered afterwards.
 */
export function RunCheck({
  queries,
  blockers,
  quota,
  providerConfigured,
  demoWorkspace,
}: {
  queries: string[];
  blockers: AeoBlocker[];
  quota: AeoQuota;
  providerConfigured: boolean;
  demoWorkspace: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);

  // A fresher plan fetched just before a run overrides the one this component
  // was rendered with — but only until the server re-renders with a newer one.
  // Tracking the server's plan alongside the override is what stops a stale
  // override quietly shadowing newer truth (the very bug this screen had).
  const [renderedQueries, setRenderedQueries] = useState(queries);
  const [refreshed, setRefreshed] = useState<Plan | null>(null);
  if (!sameQueries(renderedQueries, queries)) {
    setRenderedQueries(queries);
    setRefreshed(null);
  }
  const plan: Plan = refreshed ?? { queries, blockers };

  const outOfQuota = quota.remaining <= 0;
  const noQueries = plan.queries.length === 0;
  const blocked = outOfQuota || noQueries || !providerConfigured || demoWorkspace;

  async function run() {
    setPending(true);
    setMessage(null);

    // Refresh the preview from the server before spending anything, so the list
    // on screen is as close as it can get to what this click will ask. A
    // failure here is not fatal: the run still reports what it asked.
    let previewed = plan.queries;
    try {
      const planResponse = await fetch("/api/aeo/run", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (planResponse.ok) {
        const fresh = (await planResponse.json().catch(() => ({}))) as PlanResponse;
        if (Array.isArray(fresh.queries)) {
          const next: Plan = { queries: fresh.queries, blockers: fresh.blockers ?? [] };
          setRefreshed(next);
          previewed = next.queries;
        }
      }
    } catch {
      // Keep the rendered preview; the run's own report is the authority.
    }

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
      // Only what the server says it asked. Never the preview, never a guess:
      // an empty or absent list is rendered as "not reported", not as the
      // questions we happened to have on screen.
      setLastRun({ asked: Array.isArray(payload.asked) ? payload.asked : [], previewed });
      setMessage({ tone: payload.persisted === false ? "warn" : "ok", text: successCopy(payload) });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "The check could not be started. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  const diverged =
    lastRun !== null &&
    lastRun.asked.length > 0 &&
    !sameQueries(lastRun.asked, lastRun.previewed);

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

      {/* What the last run actually asked — reported by the run itself. This is
          shown above the preview so the real question set is never read as the
          list that merely predicted it. */}
      {lastRun ? (
        <div className="mt-4 rounded-btn border border-hairline bg-primary-wash/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon name="chat" size={13} /> Asked in the last run
            {lastRun.asked.length > 0 ? (
              <>
                {" — "}
                <span className="tabular-nums">{lastRun.asked.length}</span>{" "}
                {lastRun.asked.length === 1 ? "question" : "questions"}
              </>
            ) : null}
          </div>
          {lastRun.asked.length > 0 ? (
            <ul className="space-y-1">
              {lastRun.asked.map((query) => (
                <li key={query} className="text-[13px] text-sub">
                  &ldquo;{query}&rdquo;
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-sub">
              This run did not report the questions it asked, so they are not listed here. The
              per-question results below carry each question the run recorded.
            </p>
          )}
          {diverged ? (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-gold-deep">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              These are not the questions that were previewed before you clicked. The set is rebuilt
              from your profile at the moment of the run, and your profile details changed in
              between. What is listed here is what was asked.
            </p>
          ) : null}
        </div>
      ) : null}

      {plan.queries.length > 0 ? (
        <div className="mt-3 rounded-btn border border-hairline p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon name="search" size={13} /> {lastRun ? "The next run" : "This run"} will ask{" "}
            <span className="tabular-nums">{plan.queries.length}</span> questions
          </div>
          <ul className="space-y-1">
            {plan.queries.map((query) => (
              <li key={query} className="text-[13px] text-sub">
                &ldquo;{query}&rdquo;
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-faint">
            Written from your profile, and rewritten from it again when you press the button — so
            this is a preview, not a promise. Every run reports back the questions it actually
            asked.
          </p>
        </div>
      ) : null}

      {plan.blockers.length > 0 ? (
        <div className="mt-3 rounded-btn border border-gold/40 bg-gold-tint/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-deep">
            <Icon name="alert" size={13} />
            {plan.blockers.some((blocker) => blocker.blocking)
              ? "Missing profile detail — no questions can be written"
              : "Missing profile detail — the questions stay broad"}
          </div>
          <ul className="space-y-2.5">
            {plan.blockers.map((blocker) => (
              <li key={blocker.id}>
                <div className="text-[13px] font-semibold text-ink">{blocker.fix}</div>
                <p className="text-[12px] text-sub">{blocker.effect}</p>
                <Link
                  href={blocker.href}
                  className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary-dark underline underline-offset-2"
                >
                  {blocker.whereLabel}
                  <Icon name="arrow-right" size={12} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
            Asking <span className="tabular-nums">{plan.queries.length}</span> questions — this takes
            a few seconds per question.
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

/** Order-sensitive equality: two question sets are the same set, or they are not. */
function sameQueries(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((query, index) => query === b[index]);
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
      return `AI Visibility checks are included with ${VISIBILITY_PLAN_NAME}. Upgrade to run one.`;
    case "demo_workspace":
      return "The demo workspace shows a saved sample. Run a live check from a real workspace.";
    case "provider_unavailable":
      return "No AI provider is connected on this deployment, so there is nothing to ask. Nothing was recorded and no check was used.";
    case "no_queries": {
      const fixes = (payload.blockers ?? []).map(blockerSentence).join(" ");
      return fixes || "There isn't enough profile detail yet to write questions.";
    }
    case "unauthorized":
    case "forbidden":
      return "You need owner or manager access to run a check.";
    case "forbidden_origin":
      return "That request was blocked. Reload the page and try again.";
    default:
      return "The check could not be completed. Nothing was recorded.";
  }
}
