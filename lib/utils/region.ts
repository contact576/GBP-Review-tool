import type { Region } from "@/lib/data/types";

export function currencyFor(region: Region): "USD" | "CAD" {
  return region === "CA" ? "CAD" : "USD";
}

export function currencySymbol(region: Region): string {
  return region === "CA" ? "CA$" : "$";
}
