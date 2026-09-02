import { describe, it, expect } from "vitest";
import {
  AEO_ENGINE_IDS,
  AEO_ENGINES,
  connectedEngineIds,
  engineAvailability,
  engineModel,
} from "@/lib/aeo/engines";

describe("engine registry", () => {
  it("knows exactly which variable connects each engine", () => {
    const env = { OPENAI_API_KEY: "sk-x", PERPLEXITY_API_KEY: "pplx-x" };
    const availability = engineAvailability(env);
    expect(availability.map((a) => `${a.id}:${a.connected}`)).toEqual([
      "openai:true",
      "anthropic:false",
      "google:false",
      "perplexity:true",
    ]);
    expect(availability.find((a) => a.id === "google")!.missing).toBe("GOOGLE_AI_API_KEY is not set");
    expect(availability.find((a) => a.id === "openai")!.missing).toBeNull();
    expect(connectedEngineIds(env)).toEqual(["openai", "perplexity"]);
  });

  it("treats a blank key as not connected", () => {
    expect(connectedEngineIds({ OPENAI_API_KEY: "   " })).toEqual([]);
  });

  it("honours a per-engine model override and Claude's app-wide setting", () => {
    expect(engineModel("openai", {})).toBe(AEO_ENGINES.openai.defaultModel);
    expect(engineModel("openai", { FOUNDLY_AEO_OPENAI_MODEL: "gpt-custom" })).toBe("gpt-custom");
    expect(engineModel("anthropic", { FOUNDLY_AI_MODEL: "claude-app" })).toBe("claude-app");
    expect(
      engineModel("anthropic", { FOUNDLY_AI_MODEL: "claude-app", FOUNDLY_AEO_ANTHROPIC_MODEL: "claude-aeo" }),
    ).toBe("claude-aeo");
  });

  it("says how each engine arrives at an answer, and only Perplexity searches the web", () => {
    for (const id of AEO_ENGINE_IDS) {
      expect(AEO_ENGINES[id].readingNote.length).toBeGreaterThan(20);
    }
    expect(AEO_ENGINES.perplexity.grounding).toBe("web_search");
    expect(AEO_ENGINES.openai.grounding).toBe("model_knowledge");
    expect(AEO_ENGINES.google.readingNote).toContain("not Google's AI Overviews");
  });
});
