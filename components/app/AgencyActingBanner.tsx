"use client";

import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { returnHomeAction } from "@/lib/actions";

/**
 * Shown on every owner-console surface while an agency admin is working
 * inside one of their client workspaces (or their own), or a platform admin
 * is inside a tenant opened from the ops console. It names the workspace and
 * who is acting, so there is never doubt about whose data is on screen, and it
 * is the way back to the admin's own console.
 */
export function AgencyActingBanner({
  client,
  brandName,
  mode = "agency",
}: {
  client: string;
  brandName: string;
  /**
   * agency  — an agency admin inside a client's workspace
   * self    — an agency admin inside the agency's OWN workspace (its listing)
   * support — a platform admin inside a tenant
   */
  mode?: "agency" | "self" | "support";
}) {
  const [leaving, startLeave] = useTransition();

  const sentence =
    mode === "support" ? (
      <>
        Viewing <strong className="font-semibold">{client}</strong> as {brandName}. Everything you change here is
        this tenant&rsquo;s, and this session is in their audit log.
      </>
    ) : mode === "self" ? (
      <>
        You are in <strong className="font-semibold">{brandName}&rsquo;s own workspace</strong> — the agency&rsquo;s
        listing, not a client&rsquo;s. Connect Google, sync and edit business details here.
      </>
    ) : (
      <>
        Managing <strong className="font-semibold">{client}</strong> as {brandName}. Everything you change here is
        this client&rsquo;s.
      </>
    );

  return (
    <div
      data-testid="agency-acting-banner"
      data-mode={mode}
      role="status"
      className="flex min-h-[40px] w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-primary/30 bg-primary-wash px-4 py-1.5 text-[13px] text-primary-dark"
    >
      <span className="flex items-center gap-2 font-medium">
        <Icon name={mode === "self" ? "building" : "users"} size={15} className="shrink-0" />
        <span>{sentence}</span>
      </span>
      <button
        type="button"
        onClick={() => startLeave(async () => { await returnHomeAction(); })}
        disabled={leaving}
        className="shrink-0 font-semibold underline underline-offset-2 transition-opacity hover:opacity-75 disabled:opacity-50"
      >
        {leaving ? "Returning…" : mode === "support" ? "Back to admin" : "Back to agency"}
      </button>
    </div>
  );
}
