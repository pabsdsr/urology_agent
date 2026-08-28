import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { billingService } from "../services/billingService.js";
import { useAuth } from "../context/useAuth.js";
import BillingProcessedToggle from "./BillingProcessedToggle.jsx";
import BillingSubmissionModal from "./BillingSubmissionModal.jsx";
import { formatPacificDateTime } from "../utils/calendarPacific.js";
import { formatBillingDateUs, parseBillingDate } from "../utils/billingFormValidation.js";
import { formatCptLinesDisplay } from "../utils/cptLines.js";
import { downloadBillingSubmissionsCsv } from "../utils/billingSubmissionsCsv.js";
import BillingDatePicker from "./BillingDatePicker.jsx";
import {
  compareBillingSubmissions,
  formatDateOfService,
  submitterDisplay,
} from "../utils/billingSubmissionUtils.js";

const QUEUE_VIEWS = {
  pending: "pending",
  processed: "processed",
};

const FILTER_INPUT_CLASS =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

// Text columns that support multi-token (OR) filtering.
const TEXT_FILTERS = [
  { column: "patient_name", label: "Patient" },
  { column: "provider_name", label: "Provider" },
  { column: "attending_name", label: "Attending" },
  { column: "location", label: "Location" },
  { column: "cpt_lines", label: "CPT" },
  { column: "icd10_code", label: "ICD-10" },
  { column: "submitted_by", label: "Submitted by" },
];

// Columns filtered by an inclusive date range.
const DATE_FILTERS = [
  { column: "submitted_at", label: "Submitted", fromYear: new Date().getFullYear() - 15 },
  { column: "patient_dob", label: "DOB", fromYear: 1900 },
  { column: "date_of_service", label: "DOS", fromYear: new Date().getFullYear() - 15 },
];

const EMPTY_DATE_FILTERS = {
  submitted_at: { from: "", to: "" },
  patient_dob: { from: "", to: "" },
  date_of_service: { from: "", to: "" },
};

function SortableHeader({ label, column, sort, onSort }) {
  const active = sort.column === column;
  const indicator = active ? (sort.direction === "asc" ? " ↑" : " ↓") : "";
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className="px-3 py-2 font-medium" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center hover:text-teal-700"
      >
        {label}
        <span className="text-teal-600" aria-hidden="true">
          {indicator}
        </span>
      </button>
    </th>
  );
}

// Text used when matching a per-column token filter, based on what the column
// shows. Only columns listed in TEXT_FILTERS are handled here.
function filterableText(row, column) {
  switch (column) {
    case "patient_name":
      return row.patient_name || "";
    case "provider_name":
      return row.provider_name || "";
    case "attending_name":
      return row.attending_name || "";
    case "location":
      return row.location || "";
    case "cpt_lines":
      return formatCptLinesDisplay(row) || "";
    case "icd10_code":
      return row.icd10_code || "";
    case "submitted_by":
      return submitterDisplay(row) || "";
    default:
      return "";
  }
}

function formatRangeChip(range) {
  const from = range.from ? formatBillingDateUs(range.from) : "";
  const to = range.to ? formatBillingDateUs(range.to) : "";
  if (from && to) return `${from} – ${to}`;
  if (from) return `≥ ${from}`;
  return `≤ ${to}`;
}

function TokenFilterInput({ tokens, onChange, placeholder }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim();
    if (!value) return;
    const exists = tokens.some((token) => token.toLowerCase() === value.toLowerCase());
    if (!exists) onChange([...tokens, value]);
    setDraft("");
  };

  const removeToken = (token) => onChange(tokens.filter((item) => item !== token));

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draft && tokens.length > 0) {
      onChange(tokens.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 min-h-[2.5rem] focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500">
      {tokens.map((token) => (
        <span
          key={token}
          className="inline-flex items-center gap-1 rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-xs text-teal-900"
        >
          {token}
          <button
            type="button"
            onClick={() => removeToken(token)}
            className="text-teal-600 hover:text-teal-900 leading-none"
            aria-label={`Remove ${token}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={tokens.length ? "" : placeholder || "Type and press Enter"}
        className="flex-1 min-w-[6rem] border-0 p-0 text-sm outline-none focus:ring-0"
      />
    </div>
  );
}

function FilterChip({ label, value, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs text-teal-900">
      <span className="font-medium">{label}:</span>
      <span className="max-w-[16rem] truncate">{value}</span>
      <button
        type="button"
        onClick={onClear}
        className="text-teal-600 hover:text-teal-900 leading-none"
        aria-label={`Clear ${label} filter`}
      >
        ×
      </button>
    </span>
  );
}

function BillingSubmissionsInbox() {
  const { user } = useAuth();
  const canView = Boolean(user?.can_view_billing);
  const canManage = Boolean(user?.billing_staff);
  const canProcess = Boolean(user?.billing_processor);
  const [submissions, setSubmissions] = useState([]);
  const [queueView, setQueueView] = useState(QUEUE_VIEWS.pending);
  const [sort, setSort] = useState({ column: null, direction: "asc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [dateFilters, setDateFilters] = useState(() => ({ ...EMPTY_DATE_FILTERS }));

  const pendingSubmissions = useMemo(
    () => submissions.filter((row) => !row.processed),
    [submissions]
  );
  const processedSubmissions = useMemo(
    () => submissions.filter((row) => row.processed),
    [submissions]
  );
  const queueSubmissions =
    queueView === QUEUE_VIEWS.processed ? processedSubmissions : pendingSubmissions;

  // Apply per-column filters: text columns match ANY of their tokens (so you can
  // filter for multiple codes at once), and date columns match an inclusive
  // [from, to] range. A DOS range on a row matches on overlap.
  const filteredSubmissions = useMemo(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    const activeText = Object.entries(columnFilters)
      .map(([column, tokens]) => [
        column,
        (Array.isArray(tokens) ? tokens : [])
          .map((token) => token.trim().toLowerCase())
          .filter(Boolean),
      ])
      .filter(([, tokens]) => tokens.length > 0);

    const activeDates = Object.entries(dateFilters)
      .map(([column, range]) => {
        const from = range.from ? parseBillingDate(range.from) : null;
        const to = range.to ? parseBillingDate(range.to) : null;
        return {
          column,
          fromMs: from ? from.getTime() : null,
          toMs: to ? to.getTime() + DAY_MS - 1 : null,
        };
      })
      .filter(({ fromMs, toMs }) => fromMs != null || toMs != null);

    if (activeText.length === 0 && activeDates.length === 0) {
      return queueSubmissions;
    }

    return queueSubmissions.filter((row) => {
      for (const { column, fromMs, toMs } of activeDates) {
        let startMs;
        let endMs;
        if (column === "submitted_at") {
          // Submitted is a full timestamp, not a calendar-only date string.
          const ms = row.submitted_at ? Date.parse(row.submitted_at) : NaN;
          if (Number.isNaN(ms)) return false;
          startMs = ms;
          endMs = ms;
        } else {
          const start = row[column] ? parseBillingDate(row[column]) : null;
          if (!start) return false;
          startMs = start.getTime();
          // Date of Service can span a range; other date columns are single days.
          const endRaw =
            column === "date_of_service" && row.date_of_service_end
              ? parseBillingDate(row.date_of_service_end)
              : null;
          endMs = endRaw ? endRaw.getTime() : startMs;
        }
        if (fromMs != null && endMs < fromMs) return false;
        if (toMs != null && startMs > toMs) return false;
      }
      for (const [column, tokens] of activeText) {
        const hay = filterableText(row, column).toLowerCase();
        if (!tokens.some((token) => hay.includes(token))) return false;
      }
      return true;
    });
  }, [queueSubmissions, columnFilters, dateFilters]);

  const sortedSubmissions = useMemo(() => {
    if (!sort.column) return filteredSubmissions;
    return [...filteredSubmissions].sort((a, b) =>
      compareBillingSubmissions(a, b, sort.column, sort.direction)
    );
  }, [filteredSubmissions, sort]);

  const setColumnTokens = (column, tokens) => {
    setColumnFilters((prev) => ({ ...prev, [column]: tokens }));
  };
  const setDateFilter = (column, bound, value) => {
    setDateFilters((prev) => ({
      ...prev,
      [column]: { ...prev[column], [bound]: value },
    }));
  };
  const clearDateFilter = (column) => {
    setDateFilters((prev) => ({ ...prev, [column]: { from: "", to: "" } }));
  };
  const clearFilters = () => {
    setColumnFilters({});
    setDateFilters({ ...EMPTY_DATE_FILTERS });
  };

  const activeTextFilters = TEXT_FILTERS.filter(
    ({ column }) => (columnFilters[column] || []).length > 0
  );
  const activeDateFilters = DATE_FILTERS.filter(
    ({ column }) => dateFilters[column].from || dateFilters[column].to
  );
  const activeFilterCount = activeTextFilters.length + activeDateFilters.length;
  const hasActiveFilters = activeFilterCount > 0;

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await billingService.listSubmissions(1000, 0);
        if (!cancelled) setSubmissions(data.submissions || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load billing submissions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView]);

  const handleSort = (column) => {
    setSort((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      return { column: null, direction: "asc" };
    });
  };

  const handleDelete = async (row) => {
    const label = row.patient_name || "this submission";
    if (!window.confirm(`Delete billing submission for ${label}? This cannot be undone.`)) {
      return;
    }
    setDeletingId(row.id);
    setError("");
    try {
      await billingService.deleteSubmission(row.id);
      setSubmissions((prev) => prev.filter((s) => s.id !== row.id));
      if (selectedSubmission?.id === row.id) {
        setSelectedSubmission(null);
      }
    } catch (err) {
      setError(err.message || "Failed to delete billing submission.");
    } finally {
      setDeletingId(null);
    }
  };

  const openSubmission = (row, editing = false) => {
    setSelectedSubmission(row);
    setOpenInEditMode(editing);
  };

  const mergeSubmission = (updated) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
    );
    setSelectedSubmission((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev
    );
    return updated;
  };

  const handleProcessedChange = async (row, processed) => {
    setProcessingId(row.id);
    setError("");
    try {
      const data = await billingService.setSubmissionProcessed(row.id, processed);
      mergeSubmission(data.submission);
    } catch (err) {
      setError(err.message || "Failed to update processed status.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdate = async (submissionId, payload) => {
    setSavingId(submissionId);
    setError("");
    try {
      const data = await billingService.updateSubmission(submissionId, payload);
      setOpenInEditMode(false);
      return mergeSubmission(data.submission);
    } catch (err) {
      const message = err.message || "Failed to update billing submission.";
      setError(message);
      throw new Error(message);
    } finally {
      setSavingId(null);
    }
  };

  const emptyMessage = hasActiveFilters
    ? "No submissions match the current filters."
    : queueView === QUEUE_VIEWS.processed
      ? "No processed submissions yet."
      : "No billing submissions awaiting processing.";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Billing Submissions</h2>
            <p className="text-sm text-gray-500 mt-1">
              {queueView === QUEUE_VIEWS.processed
                ? "Charges that have been marked as processed."
                : "Work queue for charges awaiting processing. Click a row to view details."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/billing"
              className={`text-sm font-medium text-teal-700 hover:text-teal-900 ${canManage ? "" : "hidden"}`}
            >
              New submission →
            </Link>
          </div>
        </div>

        {canView && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters((open) => !open)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  showFilters || hasActiveFilters
                    ? "border-teal-300 bg-teal-50 text-teal-800"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
                aria-expanded={showFilters}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-teal-600 text-white text-xs w-5 h-5">
                    {activeFilterCount}
                  </span>
                )}
                <span className="text-gray-400" aria-hidden="true">
                  {showFilters ? "▴" : "▾"}
                </span>
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  downloadBillingSubmissionsCsv(
                    sortedSubmissions,
                    `billing-submissions-${queueView}-${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                disabled={loading || sortedSubmissions.length === 0}
                className="ml-auto rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Download CSV ({sortedSubmissions.length})
              </button>
            </div>

            {hasActiveFilters && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeTextFilters.map(({ column, label }) => (
                  <FilterChip
                    key={column}
                    label={label}
                    value={(columnFilters[column] || []).join(", ")}
                    onClear={() => setColumnTokens(column, [])}
                  />
                ))}
                {activeDateFilters.map(({ column, label }) => (
                  <FilterChip
                    key={column}
                    label={label}
                    value={formatRangeChip(dateFilters[column])}
                    onClear={() => clearDateFilter(column)}
                  />
                ))}
              </div>
            )}

            {showFilters && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  {TEXT_FILTERS.map(({ column, label, placeholder }) => (
                    <div key={column} className="block">
                      <span className="block text-xs font-medium text-gray-600 mb-1">
                        {label}
                      </span>
                      <TokenFilterInput
                        tokens={columnFilters[column] || []}
                        onChange={(tokens) => setColumnTokens(column, tokens)}
                        placeholder={placeholder || "Type and press Enter"}
                      />
                    </div>
                  ))}
                  {DATE_FILTERS.map(({ column, label, fromYear }) => (
                    <div key={column} className="block">
                      <span className="block text-xs font-medium text-gray-600 mb-1">
                        {label} range
                      </span>
                      <div className="flex items-center gap-2">
                        <BillingDatePicker
                          name={`${column}-from`}
                          value={dateFilters[column].from}
                          onChange={(event) => setDateFilter(column, "from", event.target.value)}
                          inputClassName={FILTER_INPUT_CLASS}
                          placeholder="From"
                          fromYear={fromYear}
                        />
                        <span className="text-gray-400">–</span>
                        <BillingDatePicker
                          name={`${column}-to`}
                          value={dateFilters[column].to}
                          onChange={(event) => setDateFilter(column, "to", event.target.value)}
                          inputClassName={FILTER_INPUT_CLASS}
                          placeholder="To"
                          fromYear={fromYear}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Tip: type a value and press Enter to add it. Add several to a field
                  to match any of them (e.g. <span className="font-mono">52332</span> or{" "}
                  <span className="font-mono">52000</span>).
                </p>
              </div>
            )}
          </div>
        )}

        {canView && (
          <div className="mt-4 flex gap-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setQueueView(QUEUE_VIEWS.pending)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                queueView === QUEUE_VIEWS.pending
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              Work queue ({pendingSubmissions.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueView(QUEUE_VIEWS.processed)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                queueView === QUEUE_VIEWS.processed
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              Processed ({processedSubmissions.length})
            </button>
          </div>
        )}

        {!canView && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            You don&apos;t have permission to view billing submissions. Contact an administrator if
            you need the practitioner or billing role.
          </p>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {canView && loading ? (
          <p className="mt-6 text-sm text-gray-500">Loading submissions...</p>
        ) : canView && sortedSubmissions.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">{emptyMessage}</p>
        ) : canView ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-left text-gray-700">
                <tr>
                  <SortableHeader
                    label="Submitted"
                    column="submitted_at"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Patient"
                    column="patient_name"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="DOB"
                    column="patient_dob"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Provider"
                    column="provider_name"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Attending"
                    column="attending_name"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Location"
                    column="location"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="DOS"
                    column="date_of_service"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="CPT"
                    column="cpt_lines"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="ICD-10"
                    column="icd10_code"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Processed"
                    column="processed"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="By"
                    column="submitted_by"
                    sort={sort}
                    onSort={handleSort}
                  />
                  {canManage && <th className="px-3 py-2 font-medium w-28"> </th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedSubmissions.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openSubmission(row)}
                    className="align-top hover:bg-teal-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatPacificDateTime(row.submitted_at) || "—"}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.patient_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatBillingDateUs(row.patient_dob) || "—"}
                    </td>
                    <td className="px-3 py-2">{row.provider_name || "—"}</td>
                    <td className="px-3 py-2">{row.attending_name || "—"}</td>
                    <td className="px-3 py-2">{row.location || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateOfService(row) || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {formatCptLinesDisplay(row) || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.icd10_code}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <BillingProcessedToggle
                        checked={!!row.processed}
                        busy={processingId === row.id}
                        disabled={!canProcess}
                        compact
                        onChange={(processed) => handleProcessedChange(row, processed)}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {submitterDisplay(row) || "—"}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 whitespace-nowrap space-x-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSubmission(row, true);
                          }}
                          disabled={savingId === row.id || deletingId === row.id}
                          className="text-teal-700 hover:text-teal-900 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(row);
                          }}
                          disabled={deletingId === row.id || savingId === row.id}
                          className="text-red-600 hover:text-red-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          {deletingId === row.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {selectedSubmission && (
        <BillingSubmissionModal
          submission={selectedSubmission}
          onClose={() => {
            setSelectedSubmission(null);
            setOpenInEditMode(false);
          }}
          initialEditing={openInEditMode}
          onDelete={handleDelete}
          onUpdated={handleUpdate}
          onProcessedChange={handleProcessedChange}
          processingProcessed={processingId === selectedSubmission.id}
          canManage={canManage}
          canProcess={canProcess}
          deleting={deletingId === selectedSubmission.id}
          saving={savingId === selectedSubmission.id}
        />
      )}
    </div>
  );
}

export default BillingSubmissionsInbox;
