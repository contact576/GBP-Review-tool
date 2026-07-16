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

/**
 * Tokenize a CSV string into rows of raw string fields.
 * Handles quoted fields, escaped double-quotes (""), embedded commas /
 * newlines, and CRLF line endings — mirroring what {@link customersToCsv} emits.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush any trailing field/row not terminated by a newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a customer list from CSV text. Tolerant by design:
 * - the header row is optional (detected when a cell equals "name");
 * - columns are name, email, phone (mapped by header when present, otherwise
 *   positional in that order);
 * - blank rows and rows without a usable name are skipped;
 * - malformed emails are dropped from the row rather than rejecting it.
 */
export function parseCustomersCsv(
  text: string,
): { name: string; email?: string; phone?: string }[] {
  const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim() !== ""));
  const [firstRow] = rows;
  if (!firstRow) return [];

  const header = firstRow.map((c) => c.trim().toLowerCase());
  const hasHeader = header.includes("name");
  const nameIdx = hasHeader ? header.indexOf("name") : 0;
  const emailIdx = hasHeader ? header.indexOf("email") : 1;
  const phoneIdx = hasHeader ? header.indexOf("phone") : 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const out: { name: string; email?: string; phone?: string }[] = [];
  for (const row of dataRows) {
    const name = (row[nameIdx] ?? "").trim();
    if (!name) continue; // no identifier — skip
    const emailRaw = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : "";
    const phoneRaw = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() : "";
    const email = EMAIL_RE.test(emailRaw) ? emailRaw : undefined;
    const phone = phoneRaw || undefined;
    out.push({ name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) });
  }
  return out;
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
