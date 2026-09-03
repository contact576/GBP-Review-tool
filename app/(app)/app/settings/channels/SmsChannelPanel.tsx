"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Field, Input } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { Callout } from "../SettingsUI";
import { sendTestSmsAction } from "@/lib/sms/actions";
import type { ParsedSmsTest } from "@/lib/sms/test-status";

/**
 * Settings → Channels → SMS.
 *
 * Every word here is derived from `smsEnabled()` on the server and the last
 * real test result stored on the `twilio` integration tile. There is no
 * "submitted / pending carrier approval" state: Twilio is platform env config
 * and A2P 10DLC registration happens in the Twilio Console, not in Foundly, so
 * the panel can only truthfully say "sending via X" or "not configured — here
 * is exactly what to set".
 */
export interface SmsChannelView {
  enabled: boolean;
  /** "your Twilio Messaging Service (…a1b2)" / "number ending 0123"; null when not enabled. */
  sender: string | null;
  /** Env vars still missing — empty when enabled. */
  missingEnv: string[];
  /** Outcome of the last "Send test SMS", if one was ever run. */
  lastTest: (ParsedSmsTest & { at?: string }) | null;
}

export function SmsChannelPanel({ view, canTest }: { view: SmsChannelView; canTest: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testTo, setTestTo] = useState("");

  function sendTest() {
    start(async () => {
      const result = await sendTestSmsAction(testTo);
      toast(result.message, result.ok ? "success" : "warning", result.ok ? "send" : "alert");
      router.refresh();
    });
  }

  const status = !view.enabled
    ? { tone: "sub" as const, icon: "alert" as const, label: "Not configured" }
    : view.lastTest?.ok === false
      ? { tone: "gold" as const, icon: "alert" as const, label: "Test failed" }
      : view.lastTest?.ok
        ? { tone: "primary" as const, icon: "check-circle" as const, label: "Verified" }
        : { tone: "primary" as const, icon: "check-circle" as const, label: "Ready" };

  const testedOn = view.lastTest?.at ? new Date(view.lastTest.at) : null;
  const testedLabel =
    testedOn && !Number.isNaN(testedOn.getTime()) ? ` on ${testedOn.toLocaleDateString()}` : "";

  const detail = !view.enabled
    ? "Not configured · SMS review requests fall back to email"
    : view.lastTest?.ok
      ? `Ready · sending via ${view.sender ?? "Twilio"} — test accepted for ${view.lastTest.to}${testedLabel}`
      : view.lastTest
        ? `Ready · sending via ${view.sender ?? "Twilio"} — last test to ${view.lastTest.to} failed${testedLabel}`
        : `Ready · sending via ${view.sender ?? "Twilio"}`;

  return (
    <div className="py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="message" size={20} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">SMS</div>
            <div className="text-[13px] text-faint">{detail}</div>
          </div>
        </div>
        <Badge tone={status.tone} icon={status.icon}>
          {status.label}
        </Badge>
      </div>

      <div className="space-y-3 pl-0 sm:pl-[52px]">
        {view.enabled ? (
          <>
            <p className="text-[14px] text-sub">
              Review requests sent by text go through Twilio from {view.sender ?? "the configured sender"}.
              Texts only send between 8 AM and 9 PM in the customer&apos;s local time, and every message
              carries STOP/HELP handling.
            </p>

            {view.lastTest && !view.lastTest.ok ? (
              <Callout tone="danger" title="Last test text failed">
                {view.lastTest.note}
              </Callout>
            ) : null}

            {canTest ? (
              <div className="flex flex-col gap-2 rounded-card border border-hairline bg-paper p-3 sm:flex-row sm:items-end">
                <Field
                  label="Send a test to"
                  hint="International format, e.g. +14155550123. Quiet hours apply — a test outside 8 AM–9 PM local is held, not sent."
                  className="flex-1"
                >
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="+14155550123"
                    autoComplete="tel"
                  />
                </Field>
                <Button
                  variant="secondary"
                  icon="send"
                  onClick={sendTest}
                  loading={pending}
                  disabled={!testTo.trim()}
                >
                  Send test SMS
                </Button>
              </div>
            ) : (
              <p className="text-[14px] text-sub">Only owners and managers can send a test text.</p>
            )}

            <Callout tone="info">
              A2P 10DLC brand and campaign registration is managed in the Twilio Console, not here. If
              carriers have not approved the campaign yet, Twilio accepts messages but they may be
              filtered — a test that reads &ldquo;accepted&rdquo; is not proof of delivery; check the
              handset.
            </Callout>
          </>
        ) : (
          <>
            <p className="text-[14px] text-sub">
              Texting is not switched on for this deployment, so review requests that would go by SMS are
              sent by email instead. To enable it, set these environment variables and redeploy:
            </p>
            <ul className="space-y-1">
              {view.missingEnv.map((name) => (
                <li key={name} className="flex items-center gap-2 text-[13px] text-ink">
                  <Icon name="x" size={14} className="shrink-0 text-faint" />
                  <code className="data-chip rounded-chip bg-primary-wash px-2 py-0.5 text-[12px]">{name}</code>
                </li>
              ))}
            </ul>
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-primary">
                What about A2P 10DLC?
              </summary>
              <p className="mt-1 max-w-[65ch] text-[13px] text-sub">
                US and Canadian carriers require businesses to register a brand and campaign (A2P 10DLC)
                before application-to-person texts are delivered reliably. That registration is done in
                the Twilio Console against the Messaging Service or number you configure above — Foundly
                does not submit or track it.
              </p>
            </details>
            <Callout tone="warning">
              Nothing is pending on Foundly&apos;s side. Until the variables above are set, this channel
              stays off and email carries the requests.
            </Callout>
          </>
        )}
      </div>
    </div>
  );
}
