"use client";

import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { returnHomeAction } from "@/lib/actions";

/**
 * Shown on every owner-console surface while an agency admin is working
 * inside one of their client workspaces, or a platform admin is inside a
 * tenant opened from the ops console. It names the workspace and who is
 * acting, so there is never doubt about whose data is on screen, and it is
 * the way back to the admin's own console.
 */
export function AgencyActingBanner({
  client,
  brandName,
  mode = "agency",
}: {
  client: string;
  brandName: string;
  mode?: "agency" | "support";
}) {
  const [leaving, startLeave] = useTransition();

  return (
    <div
      data-testid="agency-acting-banner"
      role="status"
      className="flex min-h-[40px] w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-primary/30 bg-primary-wash px-4 py-1.5 text-[13px] text-primary-dark"
    >
      <span className="flex items-center gap-2 font-medium">
        <Icon name="users" size={15} className="shrink-0" />
        <span>
          {mode === "support" ? "Viewing" : "Managing"} <strong className="font-semibold">{client}</strong> as{" "}
          {brandName}. Everything you change here is this {mode === "support" ? "tenant" : "client"}&rsquo;s
          {mode === "support" ? ", and this session is in their audit log." : "."}
        </span>
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
