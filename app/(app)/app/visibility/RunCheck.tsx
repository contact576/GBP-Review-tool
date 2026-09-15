"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Input } from "@/components/ds/form";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/utils/format";
import { upgradeFor } from "@/lib/billing/plans";
import { setAeoQuestionsAction } from "@/lib/actions";
import type { AeoQuota } from "@/lib/aeo/metering";
import {
  AEO_MAX_OWN_QUESTIONS,
  AEO_MAX_QUESTION_LENGTH,
  blockerSentence,
  type AeoBlocker,
  type AeoPlannedQuery,
} from "@/lib/aeo/queries";

/**
 * The lowest plan that actually carries `ai_visibility`, read from the plan
 * catalog rather than typed into copy. "Pro" was folded into Growth
 * (`LEGACY_PLAN_ALIASES` in lib/billing/plans.ts) and the naming here drifted
 * behind it; deriving it means it cannot drift again.
 */
const VISIBILITY_PLAN_NAME = upgradeFor("ai_visibility").name;

/** One engine as the server reports it — connected or not, with what's missing. */
export interface EngineStatus {
  id: string;
  productName: string;
  connected: boolean;
  model: string | null;
  missing: string | null;
}

interface RunResponse {
  ok?: boolean;
  persisted?: boolean;
  error?: string;
  /** The exact questions the run sent to every engine. Authoritative. */
  asked?: string[];
  blockers?: AeoBlocker[];
  quota?: AeoQuota;
  run?: {
    summary?: { enginesConnected?: number; enginesTotal?: number; answersChecked?: number; answersNamed?: number };
    engines?: { id: string; productName: string; state: string; checked: number; named: number; notChecked: number }[];
  };
}

/** GET /api/aeo/run — the plan recomputed server-side, no model call. */
interface PlanResponse {
  ok?: boolean;
  queries?: string[];
  items?: AeoPlannedQuery[];
  blockers?: AeoBlocker[];
}

type Tone = "ok" | "warn" | "error";

interface Plan {
  items: AeoPlannedQuery[];
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
 * questions get asked, across how many engines, how many runs remain this
 * month, and — when no engine is connected — that a run would produce no
 * verdicts at all, so the button is disabled rather than burning a run on
 * nothing.
 *
 * The question set is never sent from here. The owner's own questions are
 * SAVED through a server action that cleans and caps them, and the server
 * composes the run from those plus questions written from the profile (see
 * app/api/aeo/run/route.ts). That is what stops this metered endpoint being an
 * open relay to the model. The cost of that: the list rendered here is a
 * PREVIEW recomputed independently, and an edit between render and click can
 * move it. So two things close the gap rather than trusting the preview — it is
 * refreshed from the server immediately before the run, and the run reports
 * back the questions it actually asked, which are what gets rendered afterwards.
 */
export function RunCheck({
  queries,
  items,
  ownQuestions,
  blockers,
  quota,
  engines,
  demoWorkspace,
}: {
  queries: string[];
  items: AeoPlannedQuery[];
  /** The owner's saved questions, as the server cleaned them. */
  ownQuestions: string[];
  blockers: AeoBlocker[];
  quota: AeoQuota;
  engines: EngineStatus[];
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
  const plan: Plan = refreshed ?? { items, blockers };
  const planQueries = plan.items.map((item) => item.query);

  const connected = engines.filter((engine) => engine.connected);
  const notConnected = engines.filter((engine) => !engine.connected);
  const outOfQuota = quota.remaining <= 0;
  const noQueries = plan.items.length === 0;
  const blocked = outOfQuota || noQueries || connected.length === 0 || demoWorkspace;
  const calls = plan.items.length * connected.length;

  async function run() {
    setPending(true);
    setMessage(null);

    // Refresh the preview from the server before spending anything, so the list
    // on screen is as close as it can get to what this click will ask. A
    // failure here is not fatal: the run still reports what it asked.
    let previewed = planQueries;
    try {
      const planResponse = await fetch("/api/aeo/run", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (planResponse.ok) {
        const fresh = (await planResponse.json().catch(() => ({}))) as PlanResponse;
        const freshItems: AeoPlannedQuery[] | null = Array.isArray(fresh.items)
          ? fresh.items
          : Array.isArray(fresh.queries)
            ? fresh.queries.map((query) => ({ query, source: "generated" as const }))
            : null;
        if (freshItems) {
          const next: Plan = { items: freshItems, blockers: fresh.blockers ?? [] };
          setRefreshed(next);
          previewed = freshItems.map((item) => item.query);
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

  const ownCount = plan.items.filter((item) => item.source === "own").length;
  const generatedCount = plan.items.length - ownCount;

  return (
    <Card raised>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="kicker mb-1.5">New AI Visibility check</div>
          <h2 className="text-[18px] font-bold text-ink">
            Ask {connected.length === 1 ? "one AI engine" : `${connected.length} AI engines`} the same questions
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-sub">
            Every connected engine is asked the identical questions with the identical prompt, and
            each answer is read for whether your business name appears in it. One question on one
            engine is one paid API call — this run is{" "}
            <span className="font-semibold tabular-nums text-ink">{calls}</span>{" "}
            {calls === 1 ? "call" : "calls"}, not a free lookup.
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

      {/* Which engines this click will and will not reach. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {engines.map((engine) => (
          <span
            key={engine.id}
            className={
              engine.connected
                ? "inline-flex items-center gap-1.5 rounded-chip bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary-dark shadow-[0_0_0_1px_rgba(12,122,99,0.25)]"
                : "inline-flex items-center gap-1.5 rounded-chip bg-white/40 px-2.5 py-1 text-[12px] font-semibold text-faint shadow-[0_0_0_1px_rgba(23,32,29,0.08)]"
            }
            title={engine.connected ? `Model: ${engine.model ?? "default"}` : engine.missing ?? "Not connected"}
          >
            <Icon name={engine.connected ? "check-circle" : "x"} size={13} />
            {engine.productName}
            {engine.connected && engine.model ? (
              <span className="font-normal tabular-nums text-sub">· {engine.model}</span>
            ) : null}
          </span>
        ))}
      </div>
      {notConnected.length > 0 ? (
        <p className="mt-2 text-[12px] text-faint">
          {notConnected.map((engine) => engine.productName).join(", ")}{" "}
          {notConnected.length === 1 ? "is" : "are"} not connected on this deployment and will be
          reported as not asked — never as not naming you. Connect{" "}
          {notConnected.length === 1 ? "it" : "them"} by setting{" "}
          {notConnected.map((engine) => engine.missing?.replace(" is not set", "")).filter(Boolean).join(", ")}.
        </p>
      ) : null}

      {/* The owner's own questions — the part of the run they control. */}
      <OwnQuestions
        initial={ownQuestions}
        onSaved={() => {
          setRefreshed(null);
          router.refresh();
        }}
      />

      {/* What the last run actually asked — reported by the run itself. This is
          shown above the preview so the real question set is never read as the
          list that merely predicted it. */}
      {lastRun ? (
        <div className="mt-3 rounded-[14px] bg-primary/[.06] p-3.5 shadow-[0_0_0_1px_rgba(12,122,99,0.12)]">
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
              at the moment of the run, and your questions or profile details changed in between.
              What is listed here is what was asked.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The run preview: every question, labelled by where it came from. */}
      {plan.items.length > 0 ? (
        <div className="mt-3 rounded-[14px] bg-white/45 p-3.5 shadow-[0_0_0_1px_rgba(23,32,29,0.07)]">
          <div className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon name="search" size={13} /> {lastRun ? "The next run" : "This run"} will ask{" "}
            <span className="tabular-nums">{plan.items.length}</span>{" "}
            {plan.items.length === 1 ? "question" : "questions"}
            <span className="font-medium normal-case tracking-normal text-faint">
              {" "}
              · <span className="tabular-nums">{ownCount}</span> yours,{" "}
              <span className="tabular-nums">{generatedCount}</span> from your profile
            </span>
          </div>
          <ol className="space-y-1.5">
            {plan.items.map((item, index) => (
              <li key={item.query} className="flex items-start gap-2.5 text-[13px]">
                <span className="w-4 shrink-0 pt-px text-right text-[12px] tabular-nums text-faint">{index + 1}</span>
                <span className="min-w-0 flex-1 text-ink">&ldquo;{item.query}&rdquo;</span>
                <span
                  className={
                    item.source === "own"
                      ? "shrink-0 rounded-chip bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-gold-deep"
                      : "shrink-0 rounded-chip bg-ink/[.06] px-2 py-0.5 text-[11px] font-semibold text-sub"
                  }
                >
                  {item.source === "own" ? "Yours" : "From your profile"}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2.5 text-[12px] text-faint">
            {generatedCount > 0
              ? "Profile questions are rewritten from your category, city and services when you press the button — so this is a preview, not a promise. "
              : ""}
            Every run reports back the questions it actually asked.
          </p>
        </div>
      ) : null}

      {plan.blockers.length > 0 ? (
        <div className="mt-3 rounded-[14px] bg-gold-tint/60 p-3.5 shadow-[0_0_0_1px_rgba(232,163,61,0.35)]">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-deep">
            <Icon name="alert" size={13} />
            {plan.blockers.some((blocker) => blocker.blocking)
              ? ownCount > 0
                ? "Missing profile detail — only your own questions can be asked"
                : "Missing profile detail — write your own questions, or fill the gap"
              : "Missing profile detail — the profile questions stay broad"}
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

      {connected.length === 0 ? (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] text-gold-deep">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          No AI engine is connected on this deployment, so a check would report every question as
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
          {pending ? "Asking the engines…" : "Run check"}
        </Button>
        {pending ? (
          <span role="status" className="flex items-center gap-1.5 text-[13px] text-sub">
            <Icon name="clock" size={14} />
            Asking <span className="tabular-nums">{plan.items.length}</span> questions on{" "}
            <span className="tabular-nums">{connected.length}</span>{" "}
            {connected.length === 1 ? "engine" : "engines"} — the engines run side by side, so this
            takes about as long as the slowest one.
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
          className={`mt-3 rounded-[12px] px-3 py-2 text-[13px] font-medium ${toneClass(message.tone)}`}
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The owner's question list: add one the way a customer would type it, remove
 * one, and it is saved straight away. The list shown is always the list the
 * server confirmed it kept — never the unsaved draft — so what is on screen is
 * what the next run will ask.
 */
function OwnQuestions({ initial, onSaved }: { initial: string[]; onSaved: () => void }) {
  const [saved, setSaved] = useState(initial);
  const [rendered, setRendered] = useState(initial);
  if (!sameQueries(rendered, initial)) {
    setRendered(initial);
    setSaved(initial);
  }
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<{ tone: Tone; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const full = saved.length >= AEO_MAX_OWN_QUESTIONS;
  const trimmed = draft.replace(/\s+/g, " ").trim();
  const duplicate = trimmed.length > 0 && saved.some((query) => query.toLowerCase() === trimmed.toLowerCase());

  function persist(next: string[]) {
    setNote(null);
    startSaving(async () => {
      const result = await setAeoQuestionsAction(next);
      if (!result.ok) {
        setNote({ tone: "error", text: result.message });
        return;
      }
      setSaved(result.questions);
      setNote({ tone: "ok", text: result.message });
      onSaved();
    });
  }

  function add() {
    if (!trimmed || full || duplicate) return;
    persist([...saved, trimmed]);
    setDraft("");
  }

  return (
    <div className="mt-4 rounded-[14px] bg-white/45 p-3.5 shadow-[0_0_0_1px_rgba(23,32,29,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon name="pencil" size={13} /> Your questions
          </div>
          <p className="mt-1 text-[13px] text-sub">
            Ask what your customers actually ask. Type it the way they would put it to ChatGPT —
            these are asked first, before anything written from your profile.
          </p>
        </div>
        <span className="data-chip shrink-0 text-faint">
          <span className="tabular-nums">{saved.length}</span> of{" "}
          <span className="tabular-nums">{AEO_MAX_OWN_QUESTIONS}</span>
        </span>
      </div>

      {saved.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {saved.map((query) => (
            <li
              key={query}
              className="flex items-center gap-2 rounded-[10px] bg-white/70 py-1.5 pl-3 pr-1.5 text-[13px] text-ink shadow-[0_0_0_1px_rgba(23,32,29,0.06)]"
            >
              <span className="min-w-0 flex-1">&ldquo;{query}&rdquo;</span>
              <button
                type="button"
                aria-label={`Remove question: ${query}`}
                disabled={saving}
                onClick={() => persist(saved.filter((entry) => entry !== query))}
                className="grid size-7 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-50"
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-faint">
          None yet — every question in the next run is written from your profile.
        </p>
      )}

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label htmlFor="aeo-own-question" className="sr-only">
          New question
        </label>
        <div className="min-w-0 flex-1">
          <Input
            id="aeo-own-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={AEO_MAX_QUESTION_LENGTH}
            disabled={full || saving}
            placeholder={full ? "You have the most questions a run can ask" : "e.g. who does dry needling near Leslieville"}
            iconLeft="chat"
            invalid={duplicate}
            className="h-10 min-h-[40px] text-[14px]"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          icon="plus"
          loading={saving}
          disabled={!trimmed || full || duplicate}
          className="h-10 shrink-0"
        >
          Add question
        </Button>
      </form>
      {duplicate ? (
        <p className="mt-1.5 text-[12px] text-danger">That question is already in your list.</p>
      ) : trimmed.length >= AEO_MAX_QUESTION_LENGTH ? (
        <p className="mt-1.5 text-[12px] text-faint">
          Questions are kept to {AEO_MAX_QUESTION_LENGTH} characters.
        </p>
      ) : null}
      {note ? (
        <p role="status" className={`mt-2 text-[12px] ${note.tone === "error" ? "text-danger" : "text-primary-dark"}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

/** Order-sensitive equality: two question sets are the same set, or they are not. */
function sameQueries(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((query, index) => query === b[index]);
}

function toneClass(tone: Tone): string {
  if (tone === "ok") return "bg-primary/[.08] text-primary-dark shadow-[0_0_0_1px_rgba(12,122,99,0.2)]";
  if (tone === "warn") return "bg-gold-tint/70 text-gold-deep shadow-[0_0_0_1px_rgba(232,163,61,0.35)]";
  return "bg-danger-tint text-danger shadow-[0_0_0_1px_rgba(196,69,47,0.25)]";
}

function successCopy(payload: RunResponse): string {
  const summary = payload.run?.summary;
  const engines = payload.run?.engines ?? [];
  const answered = engines.filter((engine) => engine.state === "answered");
  const checked = summary?.answersChecked ?? 0;
  const named = summary?.answersNamed ?? 0;
  const notChecked = engines.reduce((total, engine) => total + (engine.notChecked ?? 0), 0);
  const parts: string[] = [];
  if (checked > 0) {
    parts.push(
      `${answered.length} ${answered.length === 1 ? "engine" : "engines"} answered. Across ${checked} checked ${checked === 1 ? "answer" : "answers"}, you were named in ${named}.`,
    );
    const perEngine = answered
      .filter((engine) => engine.checked > 0)
      .map((engine) => `${engine.productName} ${engine.named}/${engine.checked}`)
      .join(", ");
    if (perEngine) parts.push(`By engine: ${perEngine}.`);
  } else {
    parts.push("No answer could be checked in this run.");
  }
  if (notChecked > 0) {
    parts.push(
      `${notChecked} ${notChecked === 1 ? "answer" : "answers"} could not be checked and ${notChecked === 1 ? "is" : "are"} reported as such, not as "not named".`,
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
      return "No AI engine is connected on this deployment, so there is nothing to ask. Nothing was recorded and no check was used.";
    case "no_queries": {
      const fixes = (payload.blockers ?? []).map(blockerSentence).join(" ");
      return fixes || "There isn't enough profile detail yet to write questions. Add your own questions above, or fill the gap.";
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
