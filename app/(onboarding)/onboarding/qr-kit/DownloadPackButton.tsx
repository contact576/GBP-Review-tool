"use client";

import { useState } from "react";
import { Button } from "@/components/ds";
import { Icon } from "@/components/icons";

type State = "idle" | "preparing" | "done";

export function DownloadPackButton() {
  const [state, setState] = useState<State>("idle");

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        icon={state === "done" ? "check" : "download"}
        loading={state === "preparing"}
        onClick={() => {
          if (state !== "idle") return;
          setState("preparing");
          setTimeout(() => setState("done"), 900);
        }}
      >
        {state === "done" ? "Print pack downloaded" : "Download print pack"}
      </Button>
      {state === "done" ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-primary">
          <Icon name="check-circle" size={14} /> Counter card, table tent, and window sticker — all in one PDF.
        </p>
      ) : (
        <p className="text-center text-[12px] text-faint">
          Includes counter card, table tent, and window sticker.
        </p>
      )}
    </div>
  );
}
