import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { callScheduleService } from "../services/callScheduleService";

const POD_ORDER = ["North Pod", "Central Pod", "South Pod"];
const POD_LABEL = {
  "North Pod": "North",
  "Central Pod": "Central",
  "South Pod": "South",
};

function getPodEntries(dayState, podKey) {
  if (!dayState || typeof dayState !== "object") return [];
  const arr = dayState[podKey];
  return Array.isArray(arr) ? arr : [];
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => ({
    location: String(e?.location ?? "").trim(),
    practitioner: String(e?.practitioner ?? "").trim(),
  }));
}

function entriesEqual(a, b) {
  return JSON.stringify(normalizeEntries(a)) === JSON.stringify(normalizeEntries(b));
}

/** One-line description of assignments for a pod on a day */
function describeEntries(entries) {
  const norm = normalizeEntries(entries);
  if (norm.length === 0) return "(empty)";
  return norm
    .map((e) => {
      if (e.location && e.practitioner) return `${e.location}: ${e.practitioner}`;
      if (e.practitioner) return e.practitioner;
      if (e.location) return e.location;
      return "(blank row)";
    })
    .join("; ");
}

/**
 * @returns {string[]}
 */
function summarizeScheduleChanges(entry) {
  const prev = entry.previous_by_date;
  const next = entry.updated_by_date;

  if (
    prev &&
    typeof prev === "object" &&
    next &&
    typeof next === "object"
  ) {
    const dateSet = new Set([
      ...(Array.isArray(entry.affected_dates) ? entry.affected_dates : []),
      ...Object.keys(prev),
      ...Object.keys(next),
    ]);
    const dates = [...dateSet].sort();
    const lines = [];

    for (const date of dates) {
      const before = prev[date];
      const after = next[date];
      for (const pod of POD_ORDER) {
        const oldE = getPodEntries(before, pod);
        const newE = getPodEntries(after, pod);
        if (!entriesEqual(oldE, newE)) {
          const label = POD_LABEL[pod] || pod;
          lines.push(
            `${date} · ${label}: ${describeEntries(oldE)} → ${describeEntries(newE)}`
          );
        }
      }
    }

    if (lines.length > 0) return lines;
  }

  if (Array.isArray(entry.affected_dates) && entry.affected_dates.length > 0) {
    return [
      `Updated dates: ${entry.affected_dates.join(", ")} (detailed diff not available for this entry).`,
    ];
  }

  return ["Change recorded (no breakdown available)."];
}

function formatWhen(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSource(entry) {
  if (entry.source === "upload") {
    const fn = entry.upload_filename;
    return fn ? `File upload (${fn})` : "File upload";
  }
  if (entry.source === "week_save") return "Editor save";
  return entry.source ? String(entry.source) : "—";
}

export default function CallScheduleChangeLog() {
  const { user } = useAuth();
  const [audit, setAudit] = useState([]);
  const [meta, setMeta] = useState({ limit: 100, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await callScheduleService.getAuditLog(100, 0);
        if (!cancelled) {
          setAudit(Array.isArray(data.audit) ? data.audit : []);
          setMeta({
            limit: data.limit ?? 100,
            offset: data.offset ?? 0,
          });
        }
      } catch (e) {
        if (!cancelled) {
          const msg =
            e?.response?.data?.detail ||
            e?.message ||
            "Failed to load change log";
          setError(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">Call schedule change log</h2>
          <Link
            to={user?.is_admin ? "/call-schedule-admin" : "/schedule"}
            className="text-sm text-teal-600 hover:underline"
          >
            {user?.is_admin ? "← Back to edit schedule" : "← Back to schedule"}
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Showing up to {meta.limit} entries (offset {meta.offset}). Newest
          first.
        </p>
        {loading && <p className="text-gray-600">Loading…</p>}
        {error && (
          <p className="text-red-600 text-sm whitespace-pre-wrap">{error}</p>
        )}
        {!loading && !error && audit.length === 0 && (
          <p className="text-gray-600">No changes recorded yet.</p>
        )}
        {!loading && !error && audit.length > 0 && (
          <ul className="space-y-4 text-sm">
            {audit.map((entry, i) => {
              const email =
                entry.outlook_email && String(entry.outlook_email).trim()
                  ? entry.outlook_email
                  : null;
              const changeLines = summarizeScheduleChanges(entry);
              return (
                <li
                  key={`${entry.at || "row"}-${i}`}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1 border-b border-gray-200 pb-2 mb-2">
                    <p className="font-medium text-gray-900">
                      <span className="text-gray-500 font-normal">By </span>
                      {email || (
                        <span className="text-amber-800">
                          Not recorded (signed in without Outlook email)
                        </span>
                      )}
                    </p>
                    <p className="text-gray-600 text-xs sm:text-sm">
                      {formatWhen(entry.at)}
                    </p>
                    <p className="text-gray-600 text-xs sm:text-sm">
                      {formatSource(entry)}
                    </p>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-gray-800">
                    {changeLines.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
