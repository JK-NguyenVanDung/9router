import { describe, it, expect } from "vitest";
import {
  parseModelRules,
  buildModelRulesResponse,
  inferModelTraits,
  rankModelsForContext,
} from "../../src/lib/modelRules.js";

describe("modelRules parser", () => {
  it("parses plain model IDs (legacy format)", () => {
    const content = `# coding\nclaude-3-5-sonnet\nopenai/gpt-4o\n`;
    const result = parseModelRules(content);
    expect(result.coding).toHaveLength(2);
    expect(result.coding[0].model).toBe("claude-3-5-sonnet");
    expect(result.coding[1].model).toBe("openai/gpt-4o");
  });

  it("parses annotated model lines with pipe metadata", () => {
    const content = `# subagent\ncx/gpt-5.1-codex-mini | tier: ultra-save | strengths: cheap,speed,coding | notes: fastest\n`;
    const result = parseModelRules(content);
    expect(result.subagent).toHaveLength(1);
    const entry = result.subagent[0];
    expect(entry.model).toBe("cx/gpt-5.1-codex-mini");
    expect(entry.tier).toBe("ultra-save");
    expect(entry.strengths).toContain("cheap");
    expect(entry.strengths).toContain("speed");
    expect(entry.notes).toBe("fastest");
  });

  it("skips frontmatter and comments", () => {
    const content = `---\ndescription: test\n---\n// comment\n# coding\nclaude-sonnet\n`;
    const result = parseModelRules(content);
    expect(Object.keys(result)).toEqual(["coding"]);
    expect(result.coding).toHaveLength(1);
  });

  it("returns empty for empty content", () => {
    const result = parseModelRules("");
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("buildModelRulesResponse backward compat", () => {
  it("returns parsed as string arrays for legacy consumers", () => {
    const content = `# coding\ncx/gpt-5.2-codex\ncc/claude-sonnet-4-6\n`;
    const response = buildModelRulesResponse(content);
    expect(response.parsed.coding).toEqual(["cx/gpt-5.2-codex", "cc/claude-sonnet-4-6"]);
    expect(response.recommendations.coding).toBeDefined();
    expect(response.recommendations.coding.primary.model).toBe("cx/gpt-5.2-codex");
  });
});

describe("inferModelTraits", () => {
  it("classifies mini models as ultra-save", () => {
    const traits = inferModelTraits("gpt-5.1-codex-mini");
    expect(traits.tier).toBe("ultra-save");
    expect(traits.scoreHints.cost).toBe(5);
    expect(traits.scoreHints.speed).toBe(5);
  });

  it("classifies opus models as max", () => {
    const traits = inferModelTraits("claude-opus-4-6");
    expect(traits.tier).toBe("max");
    expect(traits.scoreHints.quality).toBe(5);
  });

  it("classifies sonnet models as balanced", () => {
    const traits = inferModelTraits("claude-sonnet-4-6");
    expect(traits.tier).toBe("balanced");
    expect(traits.strengths).toContain("balanced");
  });

  it("classifies flash as ultra-save", () => {
    const traits = inferModelTraits("gemini-3-flash-preview");
    expect(traits.tier).toBe("ultra-save");
    expect(traits.scoreHints.cost).toBe(5);
  });
});

describe("rankModelsForContext", () => {
  const entries = [
    { model: "cx/gpt-5.2-codex", tier: "balanced", strengths: ["coding", "quality"], scoreHints: { coding: 4, quality: 4, cost: 3, speed: 3, reasoning: 4, context: 3, tooling: 4 } },
    { model: "cx/gpt-5.1-codex-mini", tier: "ultra-save", strengths: ["cheap", "speed", "coding"], scoreHints: { coding: 3, quality: 2, cost: 5, speed: 5, reasoning: 2, context: 3, tooling: 4 } },
  ];

  it("ranks coding-first for coding context", () => {
    const result = rankModelsForContext("coding", entries);
    expect(result.primary.model).toBe("cx/gpt-5.2-codex");
  });

  it("ranks cheap-first for subagent context", () => {
    const result = rankModelsForContext("subagent", entries);
    expect(result.primary.model).toBe("cx/gpt-5.1-codex-mini");
  });

  it("picks cheapest as subagent model", () => {
    const result = rankModelsForContext("coding", entries);
    expect(result.subagent.model).toBe("cx/gpt-5.1-codex-mini");
  });
});
