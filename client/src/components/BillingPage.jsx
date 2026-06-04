import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { billingService } from "../services/billingService.js";
import { patientService } from "../services/patientService.js";
import LocationCombobox, {
  BILLING_LOCATIONS_STORAGE_KEY,
} from "./LocationCombobox.jsx";
import MedicalCodeCombobox from "./MedicalCodeCombobox.jsx";
import {
  ALLOWED_BILLING_IMAGE_TYPES,
  MAX_BILLING_IMAGE_BYTES,
  validateBillingForm,
} from "../utils/billingFormValidation.js";

const EMPTY_FORM = {
  patientName: "",
  patientDob: "",
  location: "",
  dateOfService: "",
  providerName: "",
  cptCode: "",
  icd10Code: "",
};

function BillingPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [billingSheetFile, setBillingSheetFile] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cameraPreferred, setCameraPreferred] = useState(true);
  const searchRef = useRef(null);

  const supportsCapture = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    const searchPatients = async () => {
      if (searchTerm.trim().length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      setSearchLoading(true);
      try {
        const data = await patientService.searchPatients(searchTerm);
        setSearchResults(data);
        setShowResults(true);
      } catch (searchError) {
        console.error("Failed to search patients:", searchError);
        setSearchResults([]);
        setShowResults(false);
      } finally {
        setSearchLoading(false);
      }
    };

    const timeout = setTimeout(searchPatients, 250);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const validate = () =>
    validateBillingForm(form, { billingSheetFile, requireSheet: true });

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
      patientDob: patient.dob || "",
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

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_BILLING_IMAGE_TYPES.includes(file.type)) {
      setBillingSheetFile(null);
      setError("Please upload a JPEG, PNG, WEBP, or HEIC image.");
      return;
    }
    if (file.size > MAX_BILLING_IMAGE_BYTES) {
      setBillingSheetFile(null);
      setError("Billing sheet image must be 10MB or less.");
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
      const result = await billingService.submitBilling({
        ...form,
        cptCode: form.cptCode.trim().toUpperCase(),
        icd10Code: form.icd10Code.trim().toUpperCase(),
        billingSheetFile,
      });
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
                        <div className="text-sm text-gray-500">DOB: {patient.dob}</div>
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
                    <p className="text-sm text-teal-700">DOB: {selectedPatient.dob}</p>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Patient Name</span>
              <input
                name="patientName"
                value={form.patientName}
                onChange={onInputChange}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Patient DOB</span>
              <input
                type="date"
                name="patientDob"
                value={form.patientDob}
                onChange={onInputChange}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Provider Name</span>
              <input
                name="providerName"
                value={form.providerName}
                onChange={onInputChange}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              />
            </label>
            <div className="block">
              <LocationCombobox
                storageKey={BILLING_LOCATIONS_STORAGE_KEY}
                label="Location"
                placeholder="Select or type a location"
                value={form.location}
                onChange={(location) => setForm((prev) => ({ ...prev, location }))}
                required
              />
            </div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Date Of Service</span>
              <input
                type="date"
                name="dateOfService"
                value={form.dateOfService}
                onChange={onInputChange}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MedicalCodeCombobox
              codeType="cpt"
              label="CPT Code"
              placeholder="Search or type e.g. 51798"
              value={form.cptCode}
              onChange={(cptCode) => setForm((prev) => ({ ...prev, cptCode }))}
              required
            />
            <MedicalCodeCombobox
              codeType="icd10"
              label="ICD-10 Code"
              placeholder="Search or type e.g. N40.1"
              value={form.icd10Code}
              onChange={(icd10Code) => setForm((prev) => ({ ...prev, icd10Code }))}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Billing Sheet Image</span>
              {supportsCapture && (
                <button
                  type="button"
                  onClick={() => setCameraPreferred((prev) => !prev)}
                  className="text-sm text-teal-700 hover:text-teal-800"
                >
                  {cameraPreferred ? "Switch to file upload" : "Switch to camera"}
                </button>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              capture={supportsCapture && cameraPreferred ? "environment" : undefined}
              onChange={onFileChange}
              className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:px-3 file:py-2 file:border-0 file:rounded-md file:bg-teal-600 file:text-white hover:file:bg-teal-700"
              required
            />
            {billingSheetFile && (
              <p className="mt-2 text-sm text-gray-600">Selected file: {billingSheetFile.name}</p>
            )}
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
