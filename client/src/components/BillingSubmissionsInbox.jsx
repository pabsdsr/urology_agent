import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { billingService } from "../services/billingService.js";
import BillingProcessedToggle from "./BillingProcessedToggle.jsx";
import BillingSubmissionModal from "./BillingSubmissionModal.jsx";
import { formatPacificDateTime } from "../utils/calendarPacific.js";
import { formatBillingModifierDisplay } from "../utils/billingFormValidation.js";
import { downloadBillingSubmissionsCsv } from "../utils/billingSubmissionsCsv.js";
import { submitterDisplay } from "../utils/billingSubmissionUtils.js";

function BillingSubmissionsInbox() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [processingId, setProcessingId] = useState(null);

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
    loadSubmissions();
  }, []);

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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Billing Submissions</h2>
            <p className="text-sm text-gray-500 mt-1">
              Click a row to view the full submission and billing sheet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadBillingSubmissionsCsv(submissions)}
              disabled={loading || submissions.length === 0}
              className="text-sm font-medium text-teal-700 hover:text-teal-900 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Download CSV
            </button>
            <Link
              to="/billing"
              className="text-sm font-medium text-teal-700 hover:text-teal-900"
            >
              New submission →
            </Link>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-gray-500">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">No billing submissions yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-left text-gray-700">
                <tr>
                  <th className="px-3 py-2 font-medium">Submitted</th>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">DOB</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">DOS</th>
                  <th className="px-3 py-2 font-medium">CPT</th>
                  <th className="px-3 py-2 font-medium">Modifiers</th>
                  <th className="px-3 py-2 font-medium">ICD-10</th>
                  <th className="px-3 py-2 font-medium">Processed</th>
                  <th className="px-3 py-2 font-medium">By</th>
                  <th className="px-3 py-2 font-medium w-28"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openSubmission(row)}
                    className="align-top hover:bg-teal-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatPacificDateTime(row.submitted_at) || "—"}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.patient_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.patient_dob || "—"}</td>
                    <td className="px-3 py-2">{row.provider_name || "—"}</td>
                    <td className="px-3 py-2">{row.location || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.date_of_service || "—"}</td>
                    <td className="px-3 py-2 font-mono">{row.cpt_code}</td>
                    <td className="px-3 py-2 font-mono">
                      {formatBillingModifierDisplay(row.cpt_modifiers) || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.icd10_code}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <BillingProcessedToggle
                        checked={!!row.processed}
                        busy={processingId === row.id}
                        compact
                        onChange={(processed) => handleProcessedChange(row, processed)}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {submitterDisplay(row) || "—"}
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          deleting={deletingId === selectedSubmission.id}
          saving={savingId === selectedSubmission.id}
        />
      )}
    </div>
  );
}

export default BillingSubmissionsInbox;
