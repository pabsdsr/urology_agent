import LocationCombobox, {
  BILLING_LOCATIONS_STORAGE_KEY,
  BILLING_PROVIDERS_STORAGE_KEY,
} from "./LocationCombobox.jsx";
import MedicalCodeCombobox from "./MedicalCodeCombobox.jsx";
import CptLinesEditor from "./CptLinesEditor.jsx";
import { BILLING_DATE_PLACEHOLDER } from "../utils/billingFormValidation.js";

const inputClassName =
  "mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

export default function BillingSubmissionFields({
  form,
  onInputChange,
  setForm,
  className = "grid grid-cols-1 md:grid-cols-2 gap-4",
  cptLinesResetKey,
  children,
}) {
  return (
    <div className={className}>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Patient Name</span>
        <input
          name="patientName"
          value={form.patientName}
          onChange={onInputChange}
          className={inputClassName}
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Patient DOB</span>
        <input
          type="text"
          name="patientDob"
          value={form.patientDob}
          onChange={onInputChange}
          placeholder={BILLING_DATE_PLACEHOLDER}
          inputMode="numeric"
          autoComplete="bday"
          className={inputClassName}
          required
        />
      </label>
      <div className="block">
        <LocationCombobox
          storageKey={BILLING_PROVIDERS_STORAGE_KEY}
          label="Provider Name"
          placeholder="Select or type a provider"
          addOptionSuffix="provider"
          value={form.providerName}
          onChange={(providerName) => setForm((prev) => ({ ...prev, providerName }))}
          required
        />
      </div>
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
          type="text"
          name="dateOfService"
          value={form.dateOfService}
          onChange={onInputChange}
          placeholder={BILLING_DATE_PLACEHOLDER}
          inputMode="numeric"
          className={inputClassName}
          required
        />
      </label>
      <CptLinesEditor
        lines={form.cptLines}
        onChange={(cptLines) => setForm((prev) => ({ ...prev, cptLines }))}
        resetKey={cptLinesResetKey}
      />
      <MedicalCodeCombobox
        codeType="icd10"
        label="ICD-10 Codes"
        placeholder="Search or type an ICD-10 code"
        values={form.icd10Codes}
        onChangeValues={(icd10Codes) => setForm((prev) => ({ ...prev, icd10Codes }))}
      />
      {children}
    </div>
  );
}
