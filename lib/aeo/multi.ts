/**
 * Aggregating one AI-Visibility run across several answer engines.
 *
 * A single assistant's answer was previously the whole feature. This turns N
 * engines × M questions into the three things an owner actually needs:
 *
 *   1. A grid — for each question, which engines named the business.
 *   2. Per-engine numbers, so "ChatGPT never names you but Perplexity always
 *      does" is visible instead of averaged away.
 *   3. A share-of-voice table placing the business among the rivals the same
 *      answers named.
 *
 * Every rate here carries its own denominator and every denominator counts only
 * answers that were really checked. Rules that follow from that:
 *
 *   - An engine with no API key is `not_connected`. It contributes nothing to
 *     any numerator OR denominator; it is never a zero.
 *   - A question an engine failed to answer is `not_checked`, never `not_named`.
 *   - A rate over zero checked answers is `null`, never 0. "We asked nothing"
 *     and "we asked and you were never named" are different facts and the UI
 *     renders them differently.
 *
 * Pure: no clock, no network, no storage. The caller supplies the per-engine
 * records that `runAeoCheck` produced.
 */

import { sameBusiness } from "./matching";
import { AEO_ENGINES, type AeoEngineId, type AeoGrounding } from "./engines";
import { isChecked, type AeoBusinessContext, type AeoQueryOutcome, type AeoRunRecord } from "./types";

/** Why an engine has no results. */
export type AeoEngineState = "answered" | "not_connected";

export interface AeoEngineMetrics {
  /** Questions put to this engine. */
  asked: number;
  /** Questions this engine actually answered usably. */
  checked: number;
  /** Checked answers that named the business. */
  named: number;
  /** named / checked. Null when nothing was checked — never 0. */
  presenceRate: number | null;
  /** Mean 1-based position across answers that named it. Null when never named. */
  averagePosition: number | null;
  /** Best (lowest) position achieved. Null when never named. */
  bestPosition: number | null;
}

export interface AeoEngineOutcome {
  engineId: AeoEngineId;
  productName: string;
  vendor: string;
  grounding: AeoGrounding;
  /** The exact model asked, or null when the engine was never asked. */
  model: string | null;
  state: AeoEngineState;
  /** Exactly what is missing, when not connected. */
  missing: string | null;
  results: AeoQueryOutcome[];
  metrics: AeoEngineMetrics | null;
}

/** One engine's answer to one question, as the grid renders it. */
export type AeoCellState = "named" | "not_named" | "not_checked" | "not_connected";

export interface AeoMatrixCell {
  engineId: AeoEngineId;
  state: AeoCellState;
  /** Position among the businesses in that answer. Only set when named. */
  position: number | null;
  /** Plain-language reason, when the cell is not_checked or not_connected. */
  note: string | null;
}

export interface AeoMatrixRow {
  query: string;
  cells: AeoMatrixCell[];
  /** Engines that named the business on this question. */
  namedOn: number;
  /** Engines that actually answered this question. The honest denominator. */
  checkedOn: number;
  /** Best position any engine gave on this question. Null when never named. */
  bestPosition: number | null;
}

export interface AeoVisibilitySummary {
  enginesConnected: number;
  enginesTotal: number;
  /** engine × question answers that produced a verdict. */
  answersChecked: number;
  answersNamed: number;
  /** answersNamed / answersChecked. Null when nothing was checked. */
  presenceRate: number | null;
  /** Mean position across every answer that named the business. */
  averagePosition: number | null;
  /** Questions at least one engine answered. */
  questionsChecked: number;
  /** Questions at least one engine named the business on. */
  questionsNamedOnAny: number;
  /** Questions every engine that answered named the business on. */
  questionsNamedOnAll: number;
}

export interface AeoCompetitorShare {
  /** Display form, as written in the answers. */
  name: string;
  /** Checked answers this name appeared in. */
  answers: number;
  /** answers / answersChecked. Null when nothing was checked. */
  share: number | null;
  /** Engines whose answers named it. */
  engines: AeoEngineId[];
  /** True for the workspace's own business. */
  isYou: boolean;
}

export interface AeoMultiRunRecord {
  schemaVersion: 2;
  runId: string;
  ranAt: string;
  /** The exact questions asked, in order. */
  queries: string[];
  engines: AeoEngineOutcome[];
  matrix: AeoMatrixRow[];
  summary: AeoVisibilitySummary;
  /** The business and its rivals, ordered by how many answers named them. */
  shareOfVoice: AeoCompetitorShare[];
}

/** One engine's contribution to a run: either a record, or the reason there isn't one. */
export interface AeoEngineInput {
  engineId: AeoEngineId;
  /** Null when the engine is not connected. */
  record: AeoRunRecord | null;
  /** Required when `record` is null. */
  missing?: string | null;
}

function engineMetrics(results: AeoQueryOutcome[]): AeoEngineMetrics {
  const checked = results.filter(isChecked);
  const named = checked.filter((result) => result.named);
  const positions = named
    .map((result) => result.position)
    .filter((position): position is number => typeof position === "number" && position > 0);
  return {
    asked: results.length,
    checked: checked.length,
    named: named.length,
    presenceRate: checked.length ? named.length / checked.length : null,
    averagePosition: positions.length
      ? positions.reduce((total, position) => total + position, 0) / positions.length
      : null,
    bestPosition: positions.length ? Math.min(...positions) : null,
  };
}

function cellFor(
  engineId: AeoEngineId,
  outcome: AeoEngineOutcome,
  query: string,
): AeoMatrixCell {
  if (outcome.state === "not_connected") {
    return { engineId, state: "not_connected", position: null, note: outcome.missing };
  }
  const result = outcome.results.find((item) => item.query === query);
  if (!result) {
    // The engine ran but this question is not in its results — treat as not
    // checked rather than inventing an absence.
    return { engineId, state: "not_checked", position: null, note: "This question has no recorded answer." };
  }
  if (result.status === "not_checked") {
    return { engineId, state: "not_checked", position: null, note: result.detail || result.reason };
  }
  return {
    engineId,
    state: result.named ? "named" : "not_named",
    position: result.named ? result.position : null,
    note: null,
  };
}

/**
 * Rivals (and the business itself) ranked by how many checked answers named
 * them. A name is counted once per answer, however many times it appears in it.
 */
export function shareOfVoice(
  engines: AeoEngineOutcome[],
  context: Pick<AeoBusinessContext, "businessName">,
  answersChecked: number,
): AeoCompetitorShare[] {
  interface Tally {
    display: string;
    answers: number;
    engines: Set<AeoEngineId>;
    isYou: boolean;
  }
  const tallies = new Map<string, Tally>();

  function bump(rawName: string, engineId: AeoEngineId, isYou: boolean) {
    const name = rawName.trim();
    if (name.length < 2) return;
    // Group by the same rule the verdict uses, so "Copper Kettle" and "Copper
    // Kettle Cafe" are not counted as two different rivals.
    const existingKey = [...tallies.keys()].find((key) => sameBusiness(key, name));
    const key = existingKey ?? name.toLowerCase();
    const tally = tallies.get(key) ?? { display: name, answers: 0, engines: new Set(), isYou };
    tally.answers += 1;
    tally.engines.add(engineId);
    tally.isYou = tally.isYou || isYou;
    // Prefer the longer written form as the display name: "Copper Kettle Cafe"
    // reads better than "Copper Kettle" and both came from real answers.
    if (name.length > tally.display.length) tally.display = name;
    tallies.set(key, tally);
  }

  for (const engine of engines) {
    for (const result of engine.results) {
      if (!isChecked(result)) continue;
      if (result.named) bump(context.businessName, engine.engineId, true);
      for (const competitor of result.competitorsNamed) {
        bump(competitor, engine.engineId, false);
      }
    }
  }

  return [...tallies.values()]
    .map<AeoCompetitorShare>((tally) => ({
      name: tally.display,
      answers: tally.answers,
      share: answersChecked ? tally.answers / answersChecked : null,
      engines: [...tally.engines],
      isYou: tally.isYou,
    }))
    .sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name));
}

export function aggregateMultiRun(input: {
  runId: string;
  ranAt: string;
  queries: string[];
  context: Pick<AeoBusinessContext, "businessName">;
  engines: AeoEngineInput[];
}): AeoMultiRunRecord {
  const engines: AeoEngineOutcome[] = input.engines.map((entry) => {
    const descriptor = AEO_ENGINES[entry.engineId];
    if (!entry.record) {
      return {
        engineId: entry.engineId,
        productName: descriptor.productName,
        vendor: descriptor.vendor,
        grounding: descriptor.grounding,
        model: null,
        state: "not_connected",
        missing: entry.missing ?? `${descriptor.keyEnvVar} is not set`,
        results: [],
        metrics: null,
      };
    }
    return {
      engineId: entry.engineId,
      productName: descriptor.productName,
      vendor: descriptor.vendor,
      grounding: descriptor.grounding,
      model: entry.record.model,
      state: "answered",
      missing: null,
      results: entry.record.results,
      metrics: engineMetrics(entry.record.results),
    };
  });

  const matrix: AeoMatrixRow[] = input.queries.map((query) => {
    const cells = engines.map((engine) => cellFor(engine.engineId, engine, query));
    const namedCells = cells.filter((cell) => cell.state === "named");
    const positions = namedCells
      .map((cell) => cell.position)
      .filter((position): position is number => typeof position === "number" && position > 0);
    return {
      query,
      cells,
      namedOn: namedCells.length,
      checkedOn: cells.filter((cell) => cell.state === "named" || cell.state === "not_named").length,
      bestPosition: positions.length ? Math.min(...positions) : null,
    };
  });

  const answersChecked = matrix.reduce((total, row) => total + row.checkedOn, 0);
  const answersNamed = matrix.reduce((total, row) => total + row.namedOn, 0);
  const allPositions = engines
    .flatMap((engine) => engine.results)
    .filter(isChecked)
    .filter((result) => result.named)
    .map((result) => result.position)
    .filter((position): position is number => typeof position === "number" && position > 0);

  const checkedRows = matrix.filter((row) => row.checkedOn > 0);
  const summary: AeoVisibilitySummary = {
    enginesConnected: engines.filter((engine) => engine.state === "answered").length,
    enginesTotal: engines.length,
    answersChecked,
    answersNamed,
    presenceRate: answersChecked ? answersNamed / answersChecked : null,
    averagePosition: allPositions.length
      ? allPositions.reduce((total, position) => total + position, 0) / allPositions.length
      : null,
    questionsChecked: checkedRows.length,
    questionsNamedOnAny: checkedRows.filter((row) => row.namedOn > 0).length,
    questionsNamedOnAll: checkedRows.filter((row) => row.namedOn === row.checkedOn).length,
  };

  return {
    schemaVersion: 2,
    runId: input.runId,
    ranAt: input.ranAt,
    queries: input.queries,
    engines,
    matrix,
    summary,
    shareOfVoice: shareOfVoice(engines, input.context, answersChecked),
  };
}
