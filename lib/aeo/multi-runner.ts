import "server-only";
import { getEngineClient } from "./engine-clients";
import { AEO_ENGINE_IDS, engineAvailability, type AeoEngineId, type AeoEnv } from "./engines";
import { aggregateMultiRun, type AeoEngineInput, type AeoMultiRunRecord } from "./multi";
import { runAeoCheck } from "./runner";
import type { AeoBusinessContext } from "./types";

/**
 * Run one question set against every connected answer engine.
 *
 * Each engine gets the identical questions and the identical prompt, so their
 * results are comparable: a difference between two columns of the grid is a
 * difference between the engines, not between what they were asked.
 *
 * Engines run in parallel with each other (each already bounds its own
 * per-question concurrency in `runAeoCheck`), so a four-engine run takes about
 * as long as the slowest single engine rather than four times as long.
 *
 * An engine without a key is recorded as not connected — it is part of the
 * report so the owner can see what was NOT asked, and it never becomes a zero.
 */
export async function runMultiEngineCheck(input: {
  context: AeoBusinessContext;
  queries: string[];
  runId: string;
  now?: Date;
  /** Defaults to every engine in the registry, in display order. */
  engineIds?: readonly AeoEngineId[];
  env?: AeoEnv;
}): Promise<AeoMultiRunRecord> {
  const now = input.now ?? new Date();
  const ids = input.engineIds ?? AEO_ENGINE_IDS;
  const availability = new Map(engineAvailability(input.env).map((entry) => [entry.id, entry]));

  const engines: AeoEngineInput[] = await Promise.all(
    ids.map(async (engineId): Promise<AeoEngineInput> => {
      const entry = availability.get(engineId);
      const client = entry?.connected ? getEngineClient(engineId) : null;
      if (!client) {
        return { engineId, record: null, missing: entry?.missing ?? null };
      }
      const record = await runAeoCheck({
        context: input.context,
        queries: input.queries,
        client,
        runId: `${input.runId}_${engineId}`,
        now,
      });
      return { engineId, record };
    }),
  );

  return aggregateMultiRun({
    runId: input.runId,
    ranAt: now.toISOString(),
    queries: input.queries,
    context: input.context,
    engines,
  });
}
