"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { Icon, type IconName } from "@/components/icons";

/**
 * Embed builder for the website review widget — a real iframe to /w/{slug}.
 *
 * Three layouts, each a genuine rendering of the same widget page with a
 * `?layout=` switch (see app/(customer)/w/[slug]/page.tsx), previewed live
 * below the code so what the owner copies is exactly what their visitors get.
 * The widget's "Leave a review" starts the guided Foundly session, so a
 * website visitor gets the same service question, chips and wording help as a
 * QR scan.
 */

type Layout = "card" | "carousel" | "badge";

const LAYOUTS: { key: Layout; label: string; icon: IconName; blurb: string; width: string; height: number }[] = [
  { key: "card", label: "Card", icon: "file", blurb: "Rating, three recent reviews and the review button. Fits a sidebar or a contact page.", width: "100%", height: 460 },
  { key: "carousel", label: "Carousel", icon: "chart", blurb: "Rating plus a swipeable row of up to eight reviews. Made for a full-width band on the homepage.", width: "100%", height: 330 },
  { key: "badge", label: "Badge", icon: "star", blurb: "One line: rating, count and a review link. Drop it in the footer or next to your logo.", width: "320", height: 76 },
];

function buildSnippet(base: string, slug: string, layout: Layout): string {
  const meta = LAYOUTS.find((item) => item.key === layout) ?? LAYOUTS[0]!;
  const src = `${base}/w/${slug}${layout === "card" ? "" : `?layout=${layout}`}`;
  const width = meta.width === "100%" ? 'width="100%"' : `width="${meta.width}"`;
  const maxWidth = layout === "card" ? "max-width:520px;" : layout === "carousel" ? "max-width:900px;" : "";
  return `<iframe
  src="${src}"
  ${width} height="${meta.height}"
  style="border:0;overflow:hidden;${maxWidth}"
  loading="lazy" title="Customer reviews"></iframe>`;
}

export function EmbedSnippet({ base, slug, domain }: { base: string; slug: string; domain: string }) {
  const { toast } = useToast();
  const [layout, setLayout] = useState<Layout>("card");
  const [copied, setCopied] = useState(false);

  const meta = LAYOUTS.find((item) => item.key === layout) ?? LAYOUTS[0]!;
  const snippet = buildSnippet(base, slug, layout);
  const previewSrc = `/w/${slug}${layout === "card" ? "" : `?layout=${layout}`}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast("Embed code copied", "success", "copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy — select and copy manually", "warning", "alert");
    }
  }

  return (
    <div className="space-y-4">
      {/* Layout picker — each card is a real variant, not a size preset. */}
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Widget layout">
        {LAYOUTS.map((item) => {
          const active = item.key === layout;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLayout(item.key)}
              className={cn(
                "rounded-card border p-3 text-left transition-colors",
                active ? "border-primary bg-primary-tint/60 shadow-sm" : "border-hairline bg-card hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("grid size-7 place-items-center rounded-btn", active ? "bg-primary text-white" : "bg-primary-wash text-primary")}>
                  <Icon name={item.icon} size={14} />
                </span>
                <span className="text-[13px] font-bold text-ink">{item.label}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-sub">{item.blurb}</p>
            </button>
          );
        })}
      </div>

      {/* Live preview — the actual widget page, so nothing here is a mock. */}
      <div className="overflow-hidden rounded-card border border-hairline">
        <div className="flex items-center justify-between gap-2 border-b border-hairline bg-card px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-sub">
            <Icon name="eye" size={13} className="text-primary" /> Live preview — exactly what {domain} visitors see
          </span>
          <a
            href={previewSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[32px] items-center gap-1 text-[12px] font-semibold text-primary-dark underline-offset-2 hover:underline"
          >
            Open <Icon name="external" size={12} />
          </a>
        </div>
        <div className="bg-paper p-3">
          <iframe
            key={previewSrc}
            src={previewSrc}
            title={`Review widget preview — ${meta.label}`}
            width={meta.width === "100%" ? "100%" : meta.width}
            height={meta.height}
            className="mx-auto block max-w-full rounded-card bg-transparent"
            style={{ border: 0, overflow: "hidden", maxWidth: layout === "card" ? 520 : layout === "carousel" ? 900 : 320 }}
            loading="lazy"
          />
        </div>
      </div>

      {/* Code well — light warm-paper wash, mono, horizontal scroll only inside. */}
      <div className="overflow-hidden rounded-card border border-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-card px-3 py-2">
          <span className="text-[13px] font-semibold text-ink">Embed code · {meta.label}</span>
          <Button variant="secondary" size="sm" icon={copied ? "check" : "copy"} onClick={copy}>
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
        <pre className="overflow-x-auto bg-primary-wash/60 p-4 text-[12.5px] leading-relaxed text-ink">
          <code className="font-mono">{snippet}</code>
        </pre>
        <div className="flex items-start gap-1.5 border-t border-hairline bg-card px-3 py-2 text-[12px] text-faint">
          <Icon name="lock" size={13} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Paste where the widget should appear on {domain}. The rating and count are Google&apos;s own figures for
            your listing; &ldquo;Leave a review&rdquo; opens the same guided review page your QR code does.
          </span>
        </div>
      </div>
    </div>
  );
}
