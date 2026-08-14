"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Badge, Chip } from "@/components/ds/misc";
import { Field, Input, Select, Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { Callout } from "../SettingsUI";
import {
  saveEmailSettingsAction,
  sendTestEmailAction,
  disconnectEmailAction,
} from "@/lib/actions";
import type { EmailSettingsView } from "@/lib/email/config";

/**
 * Self-serve email sender setup.
 *
 * Two routes, because owners split cleanly into two camps: those happy to open
 * a Resend account for best-in-class deliverability, and those who just want
 * their existing mailbox (Gmail, Microsoft 365, their web host) to send. SMTP
 * covers the second camp with no API account anywhere.
 *
 * The status badge is driven by a real test send — saving credentials alone
 * never claims "verified", because saving proves nothing about delivery.
 */

interface SmtpPreset {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  note: string;
}

/** Common providers, so nobody has to hunt for host/port in a help centre. */
const SMTP_PRESETS = {
  gmail: {
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    note: "Use a 16-character Google App Password, not your normal password. Create one at myaccount.google.com → Security → App passwords (2-Step Verification must be on).",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    note: "Use the full mailbox address as the username. If your tenant enforces modern auth, create an app password first.",
  },
  zoho: {
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    note: "Generate an app-specific password in Zoho → My Account → Security.",
  },
  custom: {
    label: "Other / my web host",
    host: "",
    port: 587,
    secure: false,
    note: "Your host's control panel lists these under 'Email accounts' or 'Outgoing mail server'.",
  },
} satisfies Record<string, SmtpPreset>;

type Provider = "resend" | "smtp";

export function EmailChannelPanel({
  settings,
  accountEmail,
  canEdit,
}: {
  settings: EmailSettingsView;
  accountEmail: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [open, setOpen] = useState(!settings.configured && !settings.envFallback);
  const [provider, setProvider] = useState<Provider>(settings.provider ?? "smtp");
  const [secret, setSecret] = useState("");
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [fromName, setFromName] = useState(settings.fromName);
  const [replyTo, setReplyTo] = useState(settings.replyTo);
  const [preset, setPreset] = useState(() => {
    const match = Object.entries(SMTP_PRESETS).find(([, p]) => p.host && p.host === settings.smtpHost);
    return match?.[0] ?? (settings.smtpHost ? "custom" : "gmail");
  });
  const [smtpHost, setSmtpHost] = useState(settings.smtpHost || SMTP_PRESETS.gmail.host);
  const [smtpPort, setSmtpPort] = useState(String(settings.smtpPort ?? 587));
  const [smtpUser, setSmtpUser] = useState(settings.smtpUser);
  const [smtpSecure, setSmtpSecure] = useState(settings.smtpSecure);
  const [testTo, setTestTo] = useState(accountEmail);

  function applyPreset(key: string) {
    setPreset(key);
    const p = (SMTP_PRESETS as Record<string, SmtpPreset | undefined>)[key];
    if (!p) return;
    if (p.host) setSmtpHost(p.host);
    setSmtpPort(String(p.port));
    setSmtpSecure(p.secure);
  }

  function save() {
    start(async () => {
      const result = await saveEmailSettingsAction({
        provider,
        secret: secret || undefined,
        fromEmail,
        fromName,
        replyTo,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUser,
        smtpSecure,
      });
      toast(result.message, result.ok ? "success" : "warning", result.ok ? "check" : "alert");
      if (result.ok) {
        setSecret("");
        router.refresh();
      }
    });
  }

  function sendTest() {
    start(async () => {
      const result = await sendTestEmailAction(testTo);
      toast(result.message, result.ok ? "success" : "warning", result.ok ? "send" : "alert");
      router.refresh();
    });
  }

  function disconnect() {
    start(async () => {
      await disconnectEmailAction();
      toast("Email sender removed. Review requests will queue until you reconnect.", "info", "mail");
      setSecret("");
      setOpen(true);
      router.refresh();
    });
  }

  const status = settings.verified
    ? { tone: "primary" as const, icon: "check-circle" as const, label: "Verified" }
    : settings.configured
      ? { tone: "gold" as const, icon: "clock" as const, label: "Untested" }
      : settings.envFallback
        ? { tone: "neutral" as const, icon: "shield" as const, label: "From environment" }
        : { tone: "sub" as const, icon: "alert" as const, label: "Not connected" };

  const detail = settings.verified
    ? `Sending as ${settings.fromEmail} — test delivered${settings.verifiedAt ? ` ${new Date(settings.verifiedAt).toLocaleDateString()}` : ""}`
    : settings.configured
      ? `Saved as ${settings.fromEmail} — send a test to confirm it delivers`
      : settings.envFallback
        ? "Using the sender configured in this deployment's environment variables"
        : "No sender connected — review request emails will queue instead of sending";

  const presetNote = (SMTP_PRESETS as Record<string, SmtpPreset | undefined>)[preset]?.note;

  return (
    <div className="py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="mail" size={20} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">Email</div>
            <div className="text-[13px] text-faint">{detail}</div>
          </div>
        </div>
        <Badge tone={status.tone} icon={status.icon}>
          {status.label}
        </Badge>
      </div>

      <div className="space-y-3 pl-0 sm:pl-[52px]">
        {settings.lastError ? (
          <Callout tone="danger" title="Last test send failed">
            {settings.lastError}
          </Callout>
        ) : null}

        {!canEdit ? (
          <p className="text-[14px] text-sub">
            Only the workspace owner can change the email sender.
          </p>
        ) : (
          <>
            {/* Test send — available the moment something is configured. */}
            {settings.configured || settings.envFallback ? (
              <div className="flex flex-col gap-2 rounded-card border border-hairline bg-paper p-3 sm:flex-row sm:items-end">
                <Field label="Send a test to" className="flex-1">
                  <Input
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@yourbusiness.com"
                  />
                </Field>
                <Button variant="secondary" icon="send" onClick={sendTest} loading={pending}>
                  Send test
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={open ? "chevron-down" : "chevron-right"}
                onClick={() => setOpen((v) => !v)}
              >
                {settings.configured ? "Edit sender" : "Connect a sender"}
              </Button>
              {settings.configured ? (
                <Button variant="ghost" size="sm" icon="x" onClick={disconnect} loading={pending}>
                  Disconnect
                </Button>
              ) : null}
            </div>

            {open ? (
              <div className="space-y-4 rounded-card border border-hairline bg-card p-4">
                <div>
                  <span className="mb-1.5 block text-[14px] font-semibold text-ink">
                    How should email send?
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      selected={provider === "smtp"}
                      onClick={() => setProvider("smtp")}
                      icon="mail"
                    >
                      My own mailbox (SMTP)
                    </Chip>
                    <Chip
                      selected={provider === "resend"}
                      onClick={() => setProvider("resend")}
                      icon="send"
                    >
                      Resend API key
                    </Chip>
                  </div>
                  <p className="mt-1.5 text-[12px] text-faint">
                    {provider === "smtp"
                      ? "Sends through an inbox you already own — nothing to sign up for."
                      : "Best deliverability at volume. Needs a Resend account with your domain verified."}
                  </p>
                </div>

                {provider === "smtp" ? (
                  <>
                    <Field label="Mail provider" hint={presetNote}>
                      <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
                        {Object.entries(SMTP_PRESETS).map(([key, p]) => (
                          <option key={key} value={key}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                      <Field label="SMTP server">
                        <Input
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="smtp.gmail.com"
                          autoComplete="off"
                        />
                      </Field>
                      <Field label="Port">
                        <Input
                          inputMode="numeric"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ""))}
                          placeholder="587"
                        />
                      </Field>
                    </div>

                    <Field label="Username" hint="Usually the full mailbox address.">
                      <Input
                        value={smtpUser}
                        onChange={(e) => {
                          setSmtpUser(e.target.value);
                          if (!fromEmail) setFromEmail(e.target.value);
                        }}
                        placeholder="reviews@yourbusiness.com"
                        autoComplete="off"
                      />
                    </Field>

                    <Field
                      label="Password or app password"
                      hint={
                        settings.configured
                          ? "Stored encrypted. Leave blank to keep the saved one."
                          : "Stored encrypted — never shown again after you save."
                      }
                    >
                      <Input
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder={settings.configured ? "••••••••••••••••" : "App password"}
                        autoComplete="new-password"
                      />
                    </Field>

                    <div className="flex items-center justify-between gap-3 rounded-btn border border-hairline px-3 py-2.5">
                      <div>
                        <div className="text-[14px] font-semibold text-ink">Implicit TLS</div>
                        <div className="text-[12px] text-faint">
                          On for port 465. Off for 587/25, which upgrades with STARTTLS.
                        </div>
                      </div>
                      <Toggle checked={smtpSecure} onChange={setSmtpSecure} label="Use implicit TLS" />
                    </div>
                  </>
                ) : (
                  <Field
                    label="Resend API key"
                    hint={
                      settings.configured
                        ? "Stored encrypted. Leave blank to keep the saved one."
                        : "From resend.com → API Keys. Stored encrypted."
                    }
                  >
                    <Input
                      type="password"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder={settings.configured ? "••••••••••••••••" : "re_..."}
                      autoComplete="new-password"
                    />
                  </Field>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="From address" hint="Must be a mailbox you control.">
                    <Input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="reviews@yourbusiness.com"
                    />
                  </Field>
                  <Field label="From name" hint="What customers see as the sender.">
                    <Input
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Harbourview Dental"
                    />
                  </Field>
                </div>

                <Field label="Reply-to (optional)" hint="Where replies land, if different.">
                  <Input
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="hello@yourbusiness.com"
                  />
                </Field>

                <Callout tone="info">
                  Send from a domain you own. Free Gmail/Outlook addresses often get rewritten or
                  filtered when used as the From address at volume — a mailbox on your own domain
                  lands far more reliably.
                </Callout>

                <div className="flex flex-wrap gap-2">
                  <Button icon="check" onClick={save} loading={pending}>
                    Save sender
                  </Button>
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
