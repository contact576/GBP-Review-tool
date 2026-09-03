import type { DataProvider } from "@/lib/data/provider";
import type { PlatformSnapshot } from "@/lib/data/types";
import { historyRecordFrom, utcDay } from "./retention";

/**
 * Store today's platform snapshot in the history table, once per UTC day.
 *
 * Two callers: the daily monitor cron (so history accrues whether or not
 * anyone opens the console) and the ops overview page itself (so history
 * starts the first time an operator looks, not a day later). Both are
 * idempotent — the record is keyed by day and a second write replaces the
 * first — so racing each other is harmless.
 */
export interface HistoryRecordResult {
  recorded: boolean;
  day: string;
  /** Snapshots stored after this call, counting today. */
  days: number;
}

export async function recordPlatformHistory(input: {
  provider: DataProvider;
  /** Pass the snapshot the caller already computed to avoid a second aggregate. */
  snapshot?: PlatformSnapshot;
  /** The ops team's own workspace id — what `getPlatformSnapshot` is keyed by. */
  homeWorkspaceId: string;
  now?: Date;
  /** When true, skip the write if a record for today already exists. */
  onlyIfMissing?: boolean;
}): Promise<HistoryRecordResult> {
  const now = input.now ?? new Date();
  const day = utcDay(now);
  if (input.onlyIfMissing) {
    const latest = input.snapshot?.history?.latestAt;
    if (latest === day) {
      return { recorded: false, day, days: input.snapshot?.history?.days ?? 0 };
    }
  }
  const snapshot = input.snapshot ?? (await input.provider.getPlatformSnapshot(input.homeWorkspaceId));
  const record = historyRecordFrom(snapshot, now);
  await input.provider.savePlatformHistory(record);
  const existing = snapshot.history?.days ?? 0;
  const alreadyToday = snapshot.history?.latestAt === day;
  return { recorded: true, day, days: alreadyToday ? existing : existing + 1 };
}
