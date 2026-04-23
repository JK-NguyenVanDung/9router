import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/dataDir.js";

const RULES_FILE = path.join(DATA_DIR, "model-rules.md");

const DEFAULT_RECOMMENDATION_LIMIT = 3;

const TASK_PROFILES = {
  coding: {
    description: "Main implementation, complex edits, multi-file coding",
    preferredStrengths: ["coding", "quality", "tooling"],
    preferredTags: ["balanced", "quality", "coding"],
  },
  subagent: {
    description: "Fast side tasks, lightweight exploration, cheap delegations",
    preferredStrengths: ["speed", "cheap", "tooling"],
    preferredTags: ["ultra-save", "speed", "cheap"],
  },
  planning: {
    description: "Reasoning, decomposition, architecture planning",
    preferredStrengths: ["reasoning", "quality", "context"],
    preferredTags: ["balanced", "reasoning"],
  },
  review: {
    description: "Code review, diff inspection, bug spotting",
    preferredStrengths: ["reasoning", "quality", "speed"],
    preferredTags: ["balanced", "quality"],
  },
  quick: {
    description: "Ultra-cheap short tasks and routine prompts",
    preferredStrengths: ["cheap", "speed"],
    preferredTags: ["ultra-save", "cheap"],
  },
};

export async function readModelRules() {
  try {
    const content = await fs.readFile(RULES_FILE, "utf-8");
    return buildModelRulesResponse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      const defaultContent = getDefaultRules();
      return buildModelRulesResponse(defaultContent);
    }
    throw error;
  }
}

export async function writeModelRules(content) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RULES_FILE, content, "utf-8");
  return buildModelRulesResponse(content);
}

export function buildModelRulesResponse(content) {
  const parsedMap = parseModelRules(content);
  const parsed = {};
  for (const [context, entries] of Object.entries(parsedMap)) {
    parsed[context] = entries.map(e => e.model);
  }
  return {
    content,
    parsed,
    recommendations: buildRuleRecommendations(parsedMap),
  };
}

export function parseModelRules(content) {
  const lines = content.split("\n");
  const rules = {};
  let currentContext = null;

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("//") || line.startsWith("<!--")) continue;
    if (line.startsWith("---")) continue;
    if (line.toLowerCase().startsWith("description:")) continue;

    if (line.startsWith("#")) {
      currentContext = normalizeContextName(line.replace(/^#+\s*/, ""));
      if (currentContext && !rules[currentContext]) {
        rules[currentContext] = [];
      }
      continue;
    }

    if (!currentContext) continue;

    const parsedLine = parseModelRuleLine(line);
    if (!parsedLine) continue;

    rules[currentContext].push(parsedLine);
  }

  const finalRules = {};
  for (const [context, entries] of Object.entries(rules)) {
    if (entries.length > 0) {
      finalRules[context] = entries;
    }
  }

  return finalRules;
}

function parseModelRuleLine(line) {
  const withoutBullet = line.replace(/^[-*+]\s*/, "").trim();
  if (!withoutBullet) return null;
  if (withoutBullet.includes(":") && !withoutBullet.includes("/")) return null;

  const [modelIdPart, ...annotationParts] = withoutBullet.split("|");
  const model = modelIdPart.trim().split(/\s+/)[0];
  if (!model || model.startsWith("#")) return null;

  const annotations = annotationParts.map((part) => part.trim()).filter(Boolean);
  const parsedMeta = parseAnnotations(annotations);
  const inferred = inferModelTraits(model);

  return {
    model,
    label: parsedMeta.label || inferred.label,
    tier: parsedMeta.tier || inferred.tier,
    strengths: dedupeList([...inferred.strengths, ...parsedMeta.strengths]),
    notes: parsedMeta.notes,
    scoreHints: {
      cost: parsedMeta.scoreHints.cost ?? inferred.scoreHints.cost,
      speed: parsedMeta.scoreHints.speed ?? inferred.scoreHints.speed,
      quality: parsedMeta.scoreHints.quality ?? inferred.scoreHints.quality,
      reasoning: parsedMeta.scoreHints.reasoning ?? inferred.scoreHints.reasoning,
      coding: parsedMeta.scoreHints.coding ?? inferred.scoreHints.coding,
      context: parsedMeta.scoreHints.context ?? inferred.scoreHints.context,
      tooling: parsedMeta.scoreHints.tooling ?? inferred.scoreHints.tooling,
    },
  };
}

function parseAnnotations(annotations) {
  const meta = {
    label: "",
    tier: "",
    strengths: [],
    notes: "",
    scoreHints: {},
  };

  for (const annotation of annotations) {
    const [rawKey, ...rawValueParts] = annotation.split(":");
    if (!rawKey || rawValueParts.length === 0) continue;

    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join(":").trim();
    if (!value) continue;

    if (key === "label") meta.label = value;
    else if (key === "tier") meta.tier = value.toLowerCase();
    else if (key === "strengths" || key === "tags") meta.strengths = value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    else if (key === "notes") meta.notes = value;
    else if (["cost", "speed", "quality", "reasoning", "coding", "context", "tooling"].includes(key)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) meta.scoreHints[key] = clampScore(numeric);
    }
  }

  return meta;
}

function normalizeContextName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeList(items) {
  return [...new Set(items.filter(Boolean))];
}

function clampScore(value) {
  return Math.max(1, Math.min(5, value));
}

export function inferModelTraits(model) {
  const id = model.toLowerCase();
  const strengths = [];
  let tier = "balanced";
  let label = "Balanced";

  const scoreHints = {
    cost: 3,
    speed: 3,
    quality: 3,
    reasoning: 3,
    coding: 3,
    context: 3,
    tooling: 3,
  };

  if (id.includes("mini") || id.includes("flash") || id.includes("haiku") || id.includes("spark") || id.includes("low")) {
    tier = "ultra-save";
    label = "Ultra Save";
    strengths.push("cheap", "speed");
    scoreHints.cost = 5;
    scoreHints.speed = 5;
    scoreHints.quality = 2;
    scoreHints.reasoning = 2;
    scoreHints.coding = 3;
  }

  if (id.includes("sonnet") || id.includes("5.2") || id.includes("plus") || id.includes("pro")) {
    tier = tier === "ultra-save" ? tier : "balanced";
    label = tier === "ultra-save" ? label : "Balanced";
    strengths.push("balanced", "coding", "quality");
    scoreHints.quality = Math.max(scoreHints.quality, 4);
    scoreHints.reasoning = Math.max(scoreHints.reasoning, 4);
    scoreHints.coding = Math.max(scoreHints.coding, 4);
  }

  if (id.includes("opus") || id.includes("max") || id.includes("xhigh") || id.includes("o3")) {
    tier = "max";
    label = "Max Quality";
    strengths.push("quality", "reasoning");
    scoreHints.cost = 1;
    scoreHints.speed = 2;
    scoreHints.quality = 5;
    scoreHints.reasoning = 5;
    scoreHints.coding = Math.max(scoreHints.coding, 4);
  }

  if (id.includes("codex") || id.includes("coder") || id.includes("claude") || id.includes("qwen")) {
    strengths.push("coding", "tooling");
    scoreHints.coding = Math.max(scoreHints.coding, 4);
    scoreHints.tooling = Math.max(scoreHints.tooling, 4);
  }

  if (id.includes("gemini")) {
    strengths.push("context", "speed");
    scoreHints.context = 5;
    scoreHints.speed = Math.max(scoreHints.speed, 4);
  }

  if (id.includes("reason") || id.includes("o3") || id.includes("opus")) {
    strengths.push("reasoning");
    scoreHints.reasoning = 5;
  }

  return {
    label,
    tier,
    strengths: dedupeList(strengths.length > 0 ? strengths : ["balanced"]),
    scoreHints,
  };
}

export function buildRuleRecommendations(parsedRules) {
  const recommendations = {};

  for (const [context, entries] of Object.entries(parsedRules || {})) {
    recommendations[context] = rankModelsForContext(context, entries);
  }

  return recommendations;
}

export function rankModelsForContext(context, entries, limit = DEFAULT_RECOMMENDATION_LIMIT) {
  const normalizedContext = normalizeContextName(context);
  const profile = TASK_PROFILES[normalizedContext] || TASK_PROFILES.coding;
  const safeEntries = Array.isArray(entries) ? entries : [];

  const ranked = safeEntries
    .map((entry, index) => {
      const score = scoreRuleEntry(entry, profile, index);
      return {
        ...entry,
        score,
        reason: buildRecommendationReason(entry, profile),
      };
    })
    .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))
    .slice(0, limit);

  return {
    context: normalizedContext,
    description: profile.description,
    primary: ranked[0] || null,
    subagent: pickSubagentModel(safeEntries, normalizedContext),
    fallbacks: ranked.slice(1),
    ranked,
  };
}

function scoreRuleEntry(entry, profile, index) {
  const strengths = new Set(entry.strengths || []);
  const hints = entry.scoreHints || {};
  let score = Math.max(0, 30 - index * 4);

  for (const preferred of profile.preferredStrengths || []) {
    score += (hints[preferred] || 0) * 5;
    if (strengths.has(preferred)) score += 6;
  }

  for (const tag of profile.preferredTags || []) {
    if ((entry.tier || "").toLowerCase() === tag) score += 10;
    if (strengths.has(tag)) score += 4;
  }

  if ((entry.tier || "") === "ultra-save") score += hints.cost >= 4 ? 5 : 0;
  if ((entry.tier || "") === "max") score -= profile.preferredTags?.includes("ultra-save") ? 12 : 0;

  return score;
}

function buildRecommendationReason(entry, profile) {
  const matched = (entry.strengths || []).filter((item) =>
    (profile.preferredStrengths || []).includes(item) || (profile.preferredTags || []).includes(item)
  );

  if (matched.length > 0) return matched.join(", ");
  if (entry.notes) return entry.notes;
  return entry.label || entry.tier || "general";
}

function pickSubagentModel(entries, context) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const cheapRanked = [...entries]
    .map((entry) => ({ entry, score: (entry.scoreHints?.cost || 0) * 6 + (entry.scoreHints?.speed || 0) * 5 }))
    .sort((a, b) => b.score - a.score);

  if (context === "subagent" || context === "quick") {
    return cheapRanked[0]?.entry || entries[0] || null;
  }

  return cheapRanked[0]?.entry || entries[0] || null;
}

function getDefaultRules() {
  return `---
description: 9Router dynamic model assignments tuned for value-first routing.
---

# Use ordered models per task. First line is the default winner.
# Optional metadata format:
# provider/model | tier: ultra-save|balanced|max | strengths: cheap,speed,coding | notes: short hint

# coding
cx/gpt-5.2-codex | tier: balanced | strengths: coding,quality,tooling | notes: best default for serious code changes
cc/claude-sonnet-4-6 | tier: balanced | strengths: coding,quality,reasoning | notes: strong fallback when Claude is available
qw/qwen3-coder-plus | tier: balanced | strengths: coding,cheap | notes: strong value coding option
cx/gpt-5.1-codex-mini | tier: ultra-save | strengths: cheap,speed,coding | notes: use for small edits and fast loops

# subagent
cx/gpt-5.1-codex-mini | tier: ultra-save | strengths: cheap,speed,coding | notes: default subagent to save tokens
cc/claude-haiku-4-5-20251001 | tier: ultra-save | strengths: cheap,speed | notes: use only while under Claude cap
qw/qwen3-coder-flash | tier: ultra-save | strengths: cheap,speed,coding
gc/gemini-3-flash-preview | tier: ultra-save | strengths: speed,context | notes: great for broad repo scans

# planning
cx/gpt-5.2 | tier: balanced | strengths: reasoning,quality,context | notes: default planning model
cc/claude-opus-4-6 | tier: max | strengths: reasoning,quality | notes: reserve for hard architectural decisions
cx/gpt-5.1-codex-max | tier: max | strengths: reasoning,coding,quality

# review
cc/claude-sonnet-4-6 | tier: balanced | strengths: review,reasoning,quality | notes: strongest review/value balance
cx/gpt-5.2 | tier: balanced | strengths: reasoning,quality,coding
cx/gpt-5.1-codex-mini | tier: ultra-save | strengths: cheap,speed | notes: use for quick lint-style review

# quick
cx/gpt-5.1-codex-mini | tier: ultra-save | strengths: cheap,speed,coding
cc/claude-haiku-4-5-20251001 | tier: ultra-save | strengths: cheap,speed
gc/gemini-3-flash-preview | tier: ultra-save | strengths: speed,context
`;
}
