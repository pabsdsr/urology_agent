import { useEffect, useState } from "react";
import BillingSheetImage from "./BillingSheetImage.jsx";
import BillingProcessedToggle from "./BillingProcessedToggle.jsx";
import BillingSubmissionFields from "./BillingSubmissionFields.jsx";
import { validateBillingForm, validateBillingSheetFile, BILLING_IMAGE_ACCEPT, formatBillingDateUs } from "../utils/billingFormValidation.js";
import { formatCptLinesDisplay } from "../utils/cptLines.js";
import { formatPacificDateTime } from "../utils/calendarPacific.js";
import {
  formToSubmissionPayload,
  lastUpdatedAt,
  submissionToEditForm,
  submitterDisplay,
} from "../utils/billingSubmissionUtils.js";

function DetailRow({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className={`mt-0.5 text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

export default function BillingSubmissionModal({
  submission,
  onClose,
  onDelete,
  onUpdated,
  onProcessedChange,
  processingProcessed = false,
  canManage = false,
  canProcess = false,
  initialEditing = false,
  deleting,
  saving,
}) {
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [form, setForm] = useState(() => submissionToEditForm(submission));
  const [billingSheetFile, setBillingSheetFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [sheetReloadKey, setSheetReloadKey] = useState(0);

  useEffect(() => {
    setIsEditing(initialEditing);
    setForm(submissionToEditForm(submission));
    setBillingSheetFile(null);
    setFormError("");
    setSheetReloadKey(0);
  }, [submission, initialEditing]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isEditing) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, isEditing]);

  if (!submission) {
    return null;
  }

  const onInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSheetFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setBillingSheetFile(null);
      return;
    }
    const fileError = validateBillingSheetFile(file);
    if (fileError) {
      setBillingSheetFile(null);
      setFormError(fileError);
      event.target.value = "";
      return;
    }
    setBillingSheetFile(file);
    setFormError("");
  };

  const startEditing = () => {
    setForm(submissionToEditForm(submission));
    setBillingSheetFile(null);
    setFormError("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setForm(submissionToEditForm(submission));
    setBillingSheetFile(null);
    setFormError("");
    setIsEditing(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const validationError = validateBillingForm(form, { billingSheetFile });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");
    try {
      const updated = await onUpdated(submission.id, formToSubmissionPayload(form, billingSheetFile));
      if (billingSheetFile) {
        setSheetReloadKey((key) => key + 1);
      }
      setBillingSheetFile(null);
      setIsEditing(false);
      if (updated) {
        setForm(submissionToEditForm(updated));
      }
    } catch (err) {
      setFormError(err.message || "Failed to update submission.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-submission-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
        disabled={isEditing && saving}
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h3
              id="billing-submission-modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {isEditing ? "Edit billing submission" : "Billing submission"}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Submitted {formatPacificDateTime(submission.submitted_at) || "—"}
              <span className="block sm:inline sm:ml-2">
                · Last updated {formatPacificDateTime(lastUpdatedAt(submission)) || "—"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1 disabled:opacity-50"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {formError}
              </p>
            )}
            <BillingSubmissionFields
              form={form}
              onInputChange={onInputChange}
              setForm={setForm}
              cptLinesResetKey={submission.id}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-gray-700">
                  Replace billing sheet (optional)
                </span>
                <input
                  type="file"
                  accept={BILLING_IMAGE_ACCEPT}
                  onChange={onSheetFileChange}
                  className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
              </label>
            </BillingSubmissionFields>
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:text-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-teal-300"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="px-6 py-5 space-y-6">
              <BillingProcessedToggle
                checked={!!submission.processed}
                busy={processingProcessed}
                disabled={!canProcess}
                onChange={(processed) => onProcessedChange(submission, processed)}
              />

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <DetailRow label="Patient name" value={submission.patient_name} />
                <DetailRow label="Patient DOB" value={formatBillingDateUs(submission.patient_dob)} />
                <DetailRow label="Provider" value={submission.provider_name} />
                <DetailRow label="Incident To" value={submission.incident_to ? "Yes" : "No"} />
                {submission.incident_to ? (
                  <DetailRow label="Attending Name" value={submission.attending_name} />
                ) : null}
                <DetailRow label="Location" value={submission.location} />
                <DetailRow label="Date of service" value={formatBillingDateUs(submission.date_of_service)} />
                <DetailRow
                  label="CPT codes"
                  value={formatCptLinesDisplay(submission)}
                  mono
                />
                <DetailRow label="ICD-10 codes" value={submission.icd10_code} mono />
                <DetailRow label="Submitted by" value={submitterDisplay(submission)} />
              </dl>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Billing sheet</h4>
                <BillingSheetImage
                  submissionId={submission.id}
                  reloadKey={sheetReloadKey}
                />
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              {canManage && (
                <button
                  type="button"
                  onClick={startEditing}
                  disabled={deleting || saving}
                  className="mr-auto px-4 py-2 text-sm font-medium text-teal-700 hover:text-teal-900 disabled:text-gray-400"
                >
                  Edit
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => onDelete(submission)}
                  disabled={deleting || saving}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 disabled:text-gray-400"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
