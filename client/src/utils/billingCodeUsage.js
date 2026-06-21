const USAGE_KEYS = {
  cpt: "billingCptCodeUsage",
  icd10: "billingIcd10CodeUsage",
  modifier: "billingCptModifierUsage",
};

function readUsage(key) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsage(key, usage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(usage));
}

function normalizeCode(codeType, code) {
  const upper = String(code || "").trim().toUpperCase();
  return codeType === "modifier" ? upper.replace(/^-/, "") : upper;
}

/** Track each code selection so frequently used codes can be surfaced first. */
export function recordBillingCodeUsage(codeType, code, description = "") {
  const key = USAGE_KEYS[codeType];
  const normalized = normalizeCode(codeType, code);
  if (!key || !normalized) return;

  const usage = readUsage(key);
  const previous = usage[normalized] || { count: 0, lastUsed: 0, description: "" };
  usage[normalized] = {
    count: previous.count + 1,
    lastUsed: Date.now(),
    description: description || previous.description || "",
  };
  writeUsage(key, usage);
}

/** Recently and frequently used codes, optionally filtered by the current query. */
export function getRecentBillingCodes(codeType, { query = "", limit = 10 } = {}) {
  const key = USAGE_KEYS[codeType];
  if (!key) return [];

  const normalizedQuery = normalizeCode(codeType, query);

  return Object.entries(readUsage(key))
    .filter(([code]) => !normalizedQuery || code.includes(normalizedQuery))
    .sort(([, a], [, b]) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, limit)
    .map(([code, meta]) => ({
      code,
      description: meta.description || "",
    }));
}
