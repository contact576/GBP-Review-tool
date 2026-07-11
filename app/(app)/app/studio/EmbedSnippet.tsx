"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

/** Copyable website-widget embed snippet. */
export function EmbedSnippet({ slug, domain }: { slug: string; domain: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const snippet = `<script
  src="https://widgets.foundly.app/embed.js"
  data-foundly-slug="${slug}"
  data-variant="carousel"
  async>
</script>`;

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
