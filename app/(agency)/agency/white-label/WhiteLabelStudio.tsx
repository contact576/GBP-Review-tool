"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Field, Input } from "@/components/ds/form";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";
import { validateBrandColor, isValidHex, readableText } from "@/lib/theme/contrast";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { updateWhiteLabelAction } from "@/lib/actions";

export interface StudioInitial {
  brandName: string;
  primary: string;
  primaryDark: string;
  accent: string;
  logoText: string;
  domain?: string;
}

/** Darken a #RRGGBB hex by a factor (used for the derived primary-dark shade). */
function darkenHex(hex: string, factor = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
  return `#${[16, 8, 0]
    .map((s) => channel(s).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export interface SampleClient {
  name: string;
  city: string;
  growthScore: number;
  rating: number;
  newReviews30d: number;
}

function HexField({
  label, value, onChange, valid,
}: { label: string; value: string; onChange: (v: string) => void; valid: boolean }) {
  return (
    <Field label={label} error={valid ? undefined : "Enter a valid hex like #1E5AA8"}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={isValidHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-11 shrink-0 cursor-pointer rounded-input border border-hairline bg-card p-1"
        />
        <Input
          value={value}
          invalid={!valid}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="uppercase tracking-wide"
          aria-label={`${label} hex value`}
        />
      </div>
    </Field>
  );
}

export function WhiteLabelStudio({ initial, sample }: { initial: StudioInitial; sample: SampleClient }) {
  const { toast } = useToast();
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [brandName, setBrandName] = useState(initial.brandName);
  const [primary, setPrimary] = useState(initial.primary);
  const [accent, setAccent] = useState(initial.accent);
  const [logoText, setLogoText] = useState(initial.logoText);

  const primaryValid = isValidHex(primary);
  const accentValid = isValidHex(accent);
  const check = primaryValid ? validateBrandColor(primary) : null;
  const passes = check?.valid ?? false;

  const safePrimary = primaryValid ? primary : "#1E5AA8";
  const safeAccent = accentValid ? accent : "#E8A33D";
  const onPrimary = readableText(safePrimary);
  const onAccent = readableText(safeAccent);
  const initialLetter = (logoText.trim()[0] ?? "A").toUpperCase();

  function save() {
    if (!primaryValid || !accentValid) {
      toast("Fix the color values before saving", "warning", "alert");
      return;
    }
    startSaving(async () => {
      await updateWhiteLabelAction({
        brandName: brandName.trim() || initial.brandName,
        primary,
        primaryDark: primary === initial.primary ? initial.primaryDark : darkenHex(primary),
        accent,
        logoText: logoText.trim() || brandName.trim() || initial.logoText,
        domain: initial.domain,
        contrastValid: passes,
      });
      toast(
        passes ? "Branding saved — clients see it on their next visit" : "Saved with a contrast warning",
        passes ? "success" : "warning",
        passes ? "check-circle" : "alert",
      );
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* ── Controls ─────────────────────────────────────── */}
      <div className="space-y-4">
        <Card>
          <CardHeader kicker="Studio" title="Brand identity" />
          <div className="space-y-4">
            <Field label="Brand name" hint="Shown across the portal and every client-facing report.">
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Northside Reviews" />
            </Field>
            <Field label="Logo text" hint="First letter becomes the logo mark.">
              <Input value={logoText} onChange={(e) => setLogoText(e.target.value)} placeholder="Northside" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <HexField label="Primary" value={primary} onChange={setPrimary} valid={primaryValid} />
              <HexField label="Accent" value={accent} onChange={setAccent} valid={accentValid} />
            </div>
          </div>
        </Card>

        {/* ── Contrast validator ─────────────────────────── */}
        <Card>
          <CardHeader
            kicker="Accessibility"
            title="Contrast validator"
            action={
              primaryValid ? (
                passes ? (
                  <Badge tone="primary" icon="check-circle">AA pass</Badge>
                ) : (
                  <Badge tone="danger" icon="alert">Fails AA</Badge>
                )
              ) : (
                <Badge tone="sub" icon="x">Invalid hex</Badge>
              )
            }
          />
          {check ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-card border border-hairline p-3">
                  <div className="kicker text-faint">On paper canvas</div>
                  <div className={cn("mt-1 data-chip text-[18px] font-bold", check.ratioPaper >= 3 ? "text-primary" : "text-danger")}>
                    {check.ratioPaper.toFixed(2)}:1
                  </div>
                </div>
                <div className="rounded-card border border-hairline p-3">
                  <div className="kicker text-faint">On white cards</div>
                  <div className={cn("mt-1 data-chip text-[18px] font-bold", check.ratioWhite >= 3 ? "text-primary" : "text-danger")}>
                    {check.ratioWhite.toFixed(2)}:1
                  </div>
                </div>
              </div>
              {passes ? (
                <p className="flex items-start gap-1.5 text-[12px] text-sub">
                  <Icon name="check-circle" size={15} className="mt-px shrink-0 text-primary" />
                  Clears AA large-text / UI (≥3:1) on both surfaces. Text auto-derives to{" "}
                  <span className="font-semibold text-ink">{onPrimary === "#FFFFFF" ? "white" : "ink"}</span> for readability.
                </p>
              ) : (
                <p className="flex items-start gap-1.5 rounded-btn bg-danger-tint p-2.5 text-[12px] text-danger">
                  <Icon name="alert" size={15} className="mt-px shrink-0" />
                  This primary doesn&apos;t meet AA (3:1) on {check.ratioPaper < 3 ? "the paper canvas" : ""}
                  {check.ratioPaper < 3 && check.ratioWhite < 3 ? " and " : ""}
                  {check.ratioWhite < 3 ? "white cards" : ""}. UI using it may be hard to read — pick a darker shade.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-faint">Enter a valid hex to validate contrast.</p>
          )}
        </Card>

        <Button variant="primary" icon="check" fullWidth onClick={save} loading={saving}>Save branding</Button>

        <p className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-3 text-[12px] text-sub">
          <Icon name="lock" size={16} className="mt-px shrink-0 text-primary" />
          <span>
            <span className="font-semibold text-ink">Honesty microcopy is non-removable.</span> Color, name and logo are
            yours — the attribution-honesty and no-gating stance survives every theme.
          </span>
        </p>
      </div>

      {/* ── Live preview ─────────────────────────────────── */}
      <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="kicker text-faint">Live preview · updates as you type</div>

        {/* Report header */}
        <div className="overflow-hidden rounded-card border border-hairline shadow-sm">
          <div className="flex items-center justify-between gap-3 p-4" style={{ backgroundColor: safePrimary, color: onPrimary }}>
            <div className="flex items-center gap-2.5">
              <span
                className="grid size-9 place-items-center rounded-btn text-[16px] font-black"
                style={{ backgroundColor: onPrimary, color: safePrimary }}
              >
                {initialLetter}
              </span>
              <div>
                <div className="text-[15px] font-extrabold leading-tight">{brandName || "Your brand"}</div>
                <div className="text-[11px] opacity-80">Monthly Growth Report</div>
              </div>
            </div>
            <div className="text-right text-[11px] opacity-80">
              <div className="font-semibold">{sample.name}</div>
              <div>Last 30 days</div>
            </div>
          </div>

          {/* Mini client dashboard */}
          <div className="space-y-3 bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="kicker text-faint">Local Growth Score</div>
                <div className="text-[30px] font-extrabold leading-none tabular-nums text-ink">{sample.growthScore}</div>
              </div>
              <span
                className="rounded-chip px-2.5 py-1 text-[11px] font-bold"
                style={{ backgroundColor: safeAccent, color: onAccent }}
              >
                Trending up
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full" style={{ width: `${sample.growthScore}%`, backgroundColor: safePrimary }} />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { k: "Rating", v: sample.rating.toFixed(1) },
                { k: "New reviews", v: String(sample.newReviews30d) },
                { k: "City", v: sample.city },
              ].map((m) => (
                <div key={m.k} className="rounded-btn border border-hairline p-2 text-center">
                  <div className="text-[15px] font-bold text-ink">{m.v}</div>
                  <div className="text-[10px] text-faint">{m.k}</div>
                </div>
              ))}
            </div>
            <button
              className="w-full rounded-btn py-2.5 text-[13px] font-semibold"
              style={{ backgroundColor: safePrimary, color: onPrimary }}
            >
              Send review request
            </button>

            {/* Pinned, non-removable honesty tokens */}
            <div className="flex items-center justify-between border-t border-hairline pt-2.5 text-[10px] text-faint">
              <span className="font-semibold">{MICROCOPY.poweredByFoundly}</span>
              <span className="inline-flex items-center gap-1">
                <Icon name="lock" size={11} /> Non-removable
              </span>
            </div>
            <p className="text-[10px] text-faint">{MICROCOPY.actionsNotCustomers}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
