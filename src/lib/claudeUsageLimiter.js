import { getUsageForProvider } from "open-sse/services/usage.js";

const usageCache = new Map();
const CACHE_TTL_MS = 30 * 1000;
const CLAUDE_5H_THRESHOLD_PERCENT = 85;

function getCacheKey(connectionId, accessToken) {
  return `${connectionId || "unknown"}:${accessToken || ""}`;
}

export async function isClaudeOverUsageLimit(connectionId, accessToken) {
  if (!accessToken) return false;

  const cacheKey = getCacheKey(connectionId, accessToken);
  const now = Date.now();
  const cached = usageCache.get(cacheKey);

  if (cached) {
    if (cached.resetsAt && cached.resetsAt < now) {
      usageCache.delete(cacheKey);
    } else if (now - cached.cachedAt < CACHE_TTL_MS) {
      return cached.utilization >= CLAUDE_5H_THRESHOLD_PERCENT;
    }
  }

  try {
    const usage = await getUsageForProvider({ provider: "claude", accessToken });
    const sessionQuota = usage?.quotas?.["session (5h)"];

    if (!sessionQuota || typeof sessionQuota.used !== "number") {
      return false;
    }

    const utilization = sessionQuota.used;
    const resetsAt = sessionQuota.resetAt ? new Date(sessionQuota.resetAt).getTime() : null;

    usageCache.set(cacheKey, {
      utilization,
      resetsAt,
      cachedAt: now,
    });

    return utilization >= CLAUDE_5H_THRESHOLD_PERCENT;
  } catch (error) {
    console.error("Failed to check Claude usage limit:", error);
    return false;
  }
}

export function getClaudeLimitResetAt(connectionId, accessToken) {
  const cacheKey = getCacheKey(connectionId, accessToken);
  const cached = usageCache.get(cacheKey);
  if (!cached || !cached.resetsAt) return null;
  return new Date(cached.resetsAt).toISOString();
}
