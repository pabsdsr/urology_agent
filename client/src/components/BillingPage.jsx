import { useState } from "react";
import { Link } from "react-router-dom";
import { billingService } from "../services/billingService.js";
import { usePatientSearch } from "../hooks/usePatientSearch.js";
import BillingSubmissionFields from "./BillingSubmissionFields.jsx";
import BillingSheetInput from "./BillingSheetInput.jsx";
import { validateBillingForm, validateBillingSheetFile, formatBillingDateUs } from "../utils/billingFormValidation.js";
import { formToSubmissionPayload } from "../utils/billingSubmissionUtils.js";
import { EMPTY_CPT_LINE } from "../utils/cptLines.js";

const EMPTY_FORM = {
  patientName: "",
  patientDob: "",
  location: "",
  dateOfService: "",
  providerName: "",
  cptLines: [{ ...EMPTY_CPT_LINE }],
  icd10Codes: [],
};

function BillingPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const {
    searchTerm,
    setSearchTerm,
    results: searchResults,
    setResults: setSearchResults,
    showResults,
    setShowResults,
    loading: searchLoading,
    searchRef,
  } = usePatientSearch();
  const [billingSheetFile, setBillingSheetFile] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const validate = () => validateBillingForm(form, { billingSheetFile });

  const onInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setSearchTerm(`${patient.givenName} ${patient.familyName}`.trim());
    setShowResults(false);
    setForm((prev) => ({
      ...prev,
      patientName: `${patient.givenName} ${patient.familyName}`.trim(),
      patientDob: formatBillingDateUs(patient.dob || ""),
    }));
    setError("");
  };

  const handlePatientClear = () => {
    setSelectedPatient(null);
    setSearchTerm("");
    setSearchResults([]);
    setShowResults(false);
    setForm((prev) => ({
      ...prev,
      patientName: "",
      patientDob: "",
    }));
  };

  const onFileChange = (file) => {
    if (!file) return;
    const fileError = validateBillingSheetFile(file);
    if (fileError) {
      setBillingSheetFile(null);
      setError(fileError);
      return;
    }
    setBillingSheetFile(file);
    setError("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSuccessMessage("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await billingService.submitBilling(formToSubmissionPayload(form, billingSheetFile));
      setSuccessMessage("Billing submission saved.");
      setForm(EMPTY_FORM);
      setSelectedPatient(null);
      setSearchTerm("");
      setSearchResults([]);
      setBillingSheetFile(null);
    } catch (submitError) {
      setError(submitError.message || "Failed to save billing submission.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Billing Submission</h2>
            <p className="text-sm text-gray-500 mt-1">
              Search for a patient to auto-fill details, then complete billing codes and attach the billing sheet.
            </p>
          </div>
          <Link
            to="/billing/submissions"
            className="text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            View all submissions →
          </Link>
        </div>

        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <div ref={searchRef}>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Patient Lookup</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => {
                  if (selectedPatient) {
                    setSearchTerm("");
                    setShowResults(true);
                  }
                }}
                placeholder="Search by patient name..."
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </label>

            {showResults && (
              <div className="relative z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchLoading ? (
                  <div className="px-4 py-2 text-sm text-gray-500">Searching...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => handlePatientSelect(patient)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">
                        {patient.givenName} {patient.familyName}
                      </div>
                      {patient.dob && (
                        <div className="text-sm text-gray-500">
                          DOB: {formatBillingDateUs(patient.dob)}
                        </div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-sm text-gray-500">No patients found</div>
                )}
              </div>
            )}

            {selectedPatient && (
              <div className="mt-3 p-3 bg-teal-50 rounded-md flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-teal-900">Selected patient</p>
                  <p className="text-teal-800">
                    {selectedPatient.givenName} {selectedPatient.familyName}
                  </p>
                  {selectedPatient.dob && (
                    <p className="text-sm text-teal-700">
                      DOB: {formatBillingDateUs(selectedPatient.dob)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handlePatientClear}
                  className="text-sm text-teal-700 hover:text-teal-900"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <BillingSubmissionFields
            form={form}
            onInputChange={onInputChange}
            setForm={setForm}
          />

          <div>
            <span className="text-sm font-medium text-gray-700">
              Face Sheet <span className="font-normal text-gray-500">(optional)</span>
            </span>
            <div className="mt-1">
              <BillingSheetInput
                file={billingSheetFile}
                onFileChange={onFileChange}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full md:w-auto px-5 py-2.5 bg-teal-600 text-white rounded-md font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Saving..." : "Submit Billing"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default BillingPage;
