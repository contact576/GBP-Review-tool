"use client";

import { Button } from "@/components/ds";

/** Prints the page — the studio's print-only sheet becomes the QR kit. */
export function PrintKitButton() {
  return (
    <Button
      variant="secondary"
      size="md"
      icon="file"
      onClick={() => window.print()}
      aria-label="Print the QR kit (counter card and table tent)"
    >
      Print kit
    </Button>
  );
}
