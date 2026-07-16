"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";

/**
 * "Give a month, get a month" referral card. Self-contained: the referral code
 * lives in localStorage (stable per browser, generated on first view) so no
 * server action or data prop is needed. Copy writes the link to the clipboard;
 * where the Web Share API exists we also expose a native share affordance.
 */
const REF_KEY = "foundly:referral-code";

function readOrCreateRefCode(): string {
  try {
    const existing = window.localStorage.getItem(REF_KEY);
    if (existing) return existing;
    const code =
      Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4);
    window.localStorage.setItem(REF_KEY, code);
    return code;
  } catch {
    // Storage blocked (private mode) — fall back to an ephemeral code.
    return Math.random().toString(36).slice(2, 10);
  }
}

export function ReferralCard() {
  const { toast } = useToast();
  const [link, setLink] = useState("");
  const [canShare, setCanShare] = useState(false);

  // Build the link client-side (needs window.location.origin) after mount to
  // keep server/client markup identical during hydration.
  useEffect(() => {
    const code = readOrCreateRefCode();
    setLink(`${window.location.origin}/sign-up?ref=${code}`);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast("Copied", "success", "copy");
    } catch {
      toast("Couldn't copy — select and copy the link", "warning", "alert");
    }
  }

  async function share() {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Foundly",
          text: "Give a month, get a month — try Foundly with my link.",
          url: link,
        });
      } catch {
        // Share sheet dismissed — nothing to report.
      }
      return;
    }
    // No native share available — fall back to the clipboard.
    void copy();
  }

  return (
    <Card className="border-gold/30 bg-gold-tint/40">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-gold text-ink">
          <Icon name="gift" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold text-ink">Give a month, get a month</h2>
          <p className="mt-0.5 text-[14px] text-sub">
            Share Foundly with another local business. When they subscribe, you each get a free
            month.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 truncate rounded-btn border border-hairline bg-card px-3 py-2 font-mono text-[13px] text-sub">
              {link || "Generating your link…"}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="gold" size="sm" icon="copy" onClick={copy} disabled={!link}>
                Copy
              </Button>
              {canShare ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="external"
                  onClick={share}
                  disabled={!link}
                >
                  Share
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
