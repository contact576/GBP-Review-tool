"use client";

import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { MICROCOPY } from "@/lib/compliance/microcopy";

/**
 * "This is what your customer sees" — a faithful phone-framed preview of the
 * real review flow, built from the live design-system primitives (never a
 * fabricated screenshot). It carries a persistent "Example" label and shows
 * the authenticity surfaces at full parity: customer-owned words, an ungated
 * public Google link, and the service-consent line.
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
                <div className="text-[11px] text-sub">How was your visit?</div>
              </div>
            </div>

            {/* Star input — the literal filled-star input (star hue allowed here) */}
            <div className="mt-4 flex justify-center gap-1.5 text-star" aria-label="Five out of five stars selected">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon key={i} name="star-fill" size={28} />
              ))}
            </div>

            {/* Customer-authored review text */}
            <div className="mt-4 rounded-card border border-hairline bg-card p-3">
              <div className="kicker mb-1.5 text-primary-dark">Your experience, in your words</div>
              <div className="min-h-20 rounded-btn border border-hairline bg-paper px-3 py-2 text-[12px] leading-relaxed text-sub">
                What happened during your experience, and what would be useful for another customer to know?
              </div>
              <p className="mt-2 text-[11px] leading-snug text-faint">{MICROCOPY.aiReviewEditDisclaimer}</p>
            </div>

            {/* Public Google link at full parity (honesty law) */}
            <a
              href="#"
              data-compliance="public-google-link"
              onClick={(e) => e.preventDefault()}
              className="mt-4 inline-flex h-11 w-full select-none items-center justify-center gap-2 rounded-btn bg-primary px-4 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(23,32,29,0.12),inset_0_1px_0_rgba(255,255,255,0.16)]"
            >
              <Icon name="google" size={16} />
              Open Google to write my review
            </a>

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
