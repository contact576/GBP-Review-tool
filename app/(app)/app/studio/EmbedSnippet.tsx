"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";

/**
 * Light "code well" for the website review-widget embed — a real iframe to
 * /w/{slug}. Header bar carries format tabs (underline idiom) + a copy
 * affordance; the well itself is a warm-paper wash, never pure black.
 *
 * All three formats are genuine, working iframes to the same widget page —
 * they differ only in sizing, so nothing here is fabricated.
 */

type Format = "responsive" | "compact" | "full";

const FORMATS: { key: Format; label: string }[] = [
  { key: "responsive", label: "Responsive" },
  { key: "compact", label: "Compact" },
  { key: "full", label: "Full width" },
];

function buildSnippet(base: string, slug: string, format: Format): string {
  const src = `${base}/w/${slug}`;
  if (format === "compact") {
    return `<iframe
  src="${src}"
  width="360" height="420"
  style="border:0;overflow:hidden"
  loading="lazy" title="Customer reviews"></iframe>`;
  }
  if (format === "full") {
    return `<iframe
  src="${src}"
  width="100%" height="440"
  style="border:0;overflow:hidden"
  loading="lazy" title="Customer reviews"></iframe>`;
  }
  return `<iframe
  src="${src}"
  width="100%" height="420"
  style="border:0;overflow:hidden;max-width:520px"
  loading="lazy" title="Customer reviews"></iframe>`;
}

export function EmbedSnippet({ base, slug, domain }: { base: string; slug: string; domain: string }) {
  const { toast } = useToast();
  const [format, setFormat] = useState<Format>("responsive");
  const [copied, setCopied] = useState(false);

  const snippet = buildSnippet(base, slug, format);

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
    <div className="overflow-hidden rounded-card border border-hairline">
      {/* Header bar — format tabs (underline) on the left, copy on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-card px-3 py-2">
        <div className="flex items-center" role="tablist" aria-label="Embed format">
          {FORMATS.map((f) => {
            const active = f.key === format;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFormat(f.key)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors min-h-[40px]",
                  active
                    ? "border-primary text-ink"
                    : "border-transparent text-sub hover:text-ink",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <Button variant="secondary" size="sm" icon={copied ? "check" : "copy"} onClick={copy}>
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>

      {/* The well — light warm-paper wash, mono, horizontal scroll only inside. */}
      <pre className="overflow-x-auto bg-primary-wash/60 p-4 text-[12.5px] leading-relaxed text-ink">
        <code className="font-mono">{snippet}</code>
      </pre>

      {/* Footer caption. */}
      <div className="flex items-center gap-1.5 border-t border-hairline bg-card px-3 py-2 text-[12px] text-faint">
        <Icon name="lock" size={13} className="shrink-0 text-primary" />
        Paste before &lt;/body&gt; on {domain}
      </div>
    </div>
  );
}
