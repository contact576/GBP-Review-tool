import type { Customer } from "@/lib/data/types";

/** Serialize the raw customer graph to CSV (the anti-lock-in export). */
export function customersToCsv(customers: Customer[]): string {
  const headers = [
    "name", "email", "phone", "visits", "last_visit", "services",
    "service_consent", "marketing_consent", "casl", "lifecycle", "created_at",
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = customers.map((c) =>
    [
      c.name,
      c.email ?? "",
      c.phone ?? "",
      String(c.visitCount),
      c.lastVisitAt ?? "",
      c.services.join("; "),
      String(c.consent.serviceConsent),
      String(c.consent.marketingConsent),
      String(c.consent.caslCaptured),
      c.lifecycleStage,
      c.createdAt,
    ].map(escape).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
