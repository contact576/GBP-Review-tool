"use client";

import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { MICROCOPY } from "@/lib/compliance/microcopy";

/**
 * "This is what your customer sees" — a faithful phone-framed preview of the
 * real review flow, built from the live design-system primitives (never a
 * fabricated screenshot). It carries a persistent "Example" label.
 *
 * It mirrors the three questions the real panel asks — which service, how it
 * went, then suggested wording built from those two answers — and keeps the
 * authenticity surfaces at full parity: the customer can always edit or
 * replace the wording, the public Google link is never gated, and the
 * service-consent line is shown. Keep this in step with ReviewFlow.tsx; a
 * preview that promises a flow the customer does not get is a lie to the
 * prospect reading this page.
 */
export function ReviewFlowPreview() {
  return (
    <div className="relative mx-auto w-[300px]">
      <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
        <Badge tone="neutral" icon="eye">Example — what your customer sees</Badge>
      </div>

      {/* Phone frame */}
      <div className="rounded-[2.5rem] border-[10px] border-ink bg-ink p-0 shadow-halo">
        <div className="overflow-hidden rounded-[1.9rem] bg-paper">
          {/* Status/notch strip */}
          <div className="flex justify-center bg-ink pb-2 pt-1.5">
            <span className="h-1.5 w-16 rounded-full bg-white/25" aria-hidden />
          </div>

          <div className="px-4 pb-5 pt-4">
            {/* Business header */}
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-btn bg-hero text-white">
                <Icon name="star-fill" size={16} className="text-gold" />
              </span>
              <div>
                <div className="text-[13px] font-bold text-ink">Bright Smile Dental</div>
                <div className="text-[11px] text-sub">Takes about 30 seconds</div>
              </div>
            </div>

            {/* 1. Which service — the first question the real panel asks */}
            <div className="mt-3.5">
              <div className="kicker mb-1.5 text-primary-dark">What did you come in for?</div>
              <div className="flex flex-wrap gap-1.5">
                {["Check-up & clean", "Whitening", "Emergency"].map((service) => (
                  <span
                    key={service}
                    className={
                      service === "Check-up & clean"
                        ? "inline-flex items-center gap-1 rounded-chip border border-primary bg-primary-tint px-2 py-1 text-[11px] font-medium text-primary-dark"
                        : "inline-flex items-center rounded-chip border border-hairline bg-card px-2 py-1 text-[11px] font-medium text-sub"
                    }
                  >
                    {service === "Check-up & clean" ? <Icon name="check" size={11} /> : null}
                    {service}
                  </span>
                ))}
              </div>
            </div>

            {/* 2. How it went — stars carry the Okay/Good/Best/Awesome ladder */}
            <div className="mt-3.5">
              <div className="flex justify-center gap-1.5 text-star" aria-label="Five out of five stars selected">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon key={i} name="star-fill" size={24} />
                ))}
              </div>
              <div className="mt-1 text-center text-[11px] font-semibold text-primary">Awesome</div>
            </div>

            {/* 3. Suggested wording, built from those two answers and editable */}
            <div className="mt-3.5 rounded-card border border-primary bg-card p-3 ring-2 ring-primary/20">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="kicker text-primary-dark">Suggested — yours to edit</span>
                <Icon name="pencil" size={13} className="text-sub" />
              </div>
              <p className="text-[12px] leading-relaxed text-ink">
                Came in for a check-up and clean and the whole visit was easy. Never felt rushed, and
                everything was explained clearly.
              </p>
              <p className="mt-2 text-[11px] leading-snug text-faint">{MICROCOPY.draftEditBeforePosting}</p>
            </div>

            {/* Public Google link at full parity (honesty law) */}
            <a
              href="#"
              data-compliance="public-google-link"
              onClick={(e) => e.preventDefault()}
              className="mt-4 inline-flex h-11 w-full select-none items-center justify-center gap-2 rounded-btn bg-primary px-4 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(23,32,29,0.12),inset_0_1px_0_rgba(255,255,255,0.16)]"
            >
              <Icon name="google" size={16} />
              Copy my words &amp; open Google
            </a>
            <p className="mt-2 text-center text-[10px] leading-snug text-faint">
              {MICROCOPY.samePathEveryRating}
            </p>

            {/* Dual-consent line */}
            <div className="mt-3 flex items-start gap-2 rounded-btn bg-primary-wash px-3 py-2">
              <Icon name="check-circle" size={14} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[11px] leading-snug text-sub">{MICROCOPY.consentServiceLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
