"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

/** Copyable website-widget embed snippet — a real iframe to /w/{slug}. */
export function EmbedSnippet({ base, slug, domain }: { base: string; slug: string; domain: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const snippet = `<iframe
  src="${base}/w/${slug}"
  width="100%" height="420"
  style="border:0;overflow:hidden;max-width:520px"
  loading="lazy" title="Customer reviews"></iframe>`;

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
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] text-faint">Paste before &lt;/body&gt; on {domain}</span>
        <Button variant="secondary" size="sm" icon={copied ? "check" : "copy"} onClick={copy}>
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-btn border border-hairline bg-ink p-3 text-[12px] leading-relaxed text-white/90">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
