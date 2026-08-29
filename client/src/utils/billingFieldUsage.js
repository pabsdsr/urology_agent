// Tracks usage of free-text billing fields (provider/attending/location) so the
// most recently chosen values can be surfaced at the top of their picker —
// mirrors billingCodeUsage.js for codes. Both count and lastUsed are stored so
// callers can rank by whichever they prefer.

function readUsage(key) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Cap tracked values so localStorage doesn't grow without bound; keep the most
// frequently (then most recently) used entries.
const MAX_TRACKED_VALUES = 200;

function pruneUsage(usage) {
  const entries = Object.entries(usage);
  if (entries.length <= MAX_TRACKED_VALUES) return usage;
  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, MAX_TRACKED_VALUES)
  );
}

function writeUsage(key, usage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(pruneUsage(usage)));
  } catch {
    // Quota exceeded or storage disabled — usage ranking is best-effort.
  }
}

/** Track each value selection so frequently used values can be surfaced first. */
export function recordBillingFieldUsage(key, value) {
  const normalized = String(value || "").trim();
  if (!key || !normalized) return;

  const usage = readUsage(key);
  const previous = usage[normalized] || { count: 0, lastUsed: 0 };
  usage[normalized] = { count: previous.count + 1, lastUsed: Date.now() };
  writeUsage(key, usage);
}

/** Map of value -> usage rank ({ count, lastUsed }) for the given storage key. */
export function getBillingFieldUsage(key) {
  return key ? readUsage(key) : {};
}
