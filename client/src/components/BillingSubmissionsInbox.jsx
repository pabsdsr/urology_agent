import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { billingService } from "../services/billingService.js";
import { useAuth } from "../context/useAuth.js";
import BillingProcessedToggle from "./BillingProcessedToggle.jsx";
import BillingSubmissionModal from "./BillingSubmissionModal.jsx";
import { formatPacificDateTime } from "../utils/calendarPacific.js";
import { formatBillingDateUs } from "../utils/billingFormValidation.js";
import { formatCptLinesDisplay } from "../utils/cptLines.js";
import { downloadBillingSubmissionsCsv } from "../utils/billingSubmissionsCsv.js";
import {
  compareBillingSubmissions,
  formatDateOfService,
  submitterDisplay,
} from "../utils/billingSubmissionUtils.js";

const QUEUE_VIEWS = {
  pending: "pending",
  processed: "processed",
};

function SortableHeader({ label, column, sort, onSort }) {
  const active = sort.column === column;
  const indicator = active ? (sort.direction === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className="px-3 py-2 font-medium">
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
  const sortedSubmissions = useMemo(() => {
    if (!sort.column) return queueSubmissions;
    return [...queueSubmissions].sort((a, b) =>
      compareBillingSubmissions(a, b, sort.column, sort.direction)
    );
  }, [queueSubmissions, sort]);

  const loadSubmissions = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await billingService.listSubmissions(200, 0);
      setSubmissions(data.submissions || []);
    } catch (err) {
      setError(err.message || "Failed to load billing submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    loadSubmissions();
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

  const emptyMessage =
    queueView === QUEUE_VIEWS.processed
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
            {canView && (
              <button
                type="button"
                onClick={() =>
                  downloadBillingSubmissionsCsv(
                    queueSubmissions,
                    `billing-submissions-${queueView}-${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                disabled={loading || queueSubmissions.length === 0}
                className="text-sm font-medium text-teal-700 hover:text-teal-900 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Download CSV
              </button>
            )}
            <Link
              to="/billing"
              className={`text-sm font-medium text-teal-700 hover:text-teal-900 ${canManage ? "" : "hidden"}`}
            >
              New submission →
            </Link>
          </div>
        </div>

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
