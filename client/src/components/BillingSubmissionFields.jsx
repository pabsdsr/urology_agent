import LocationCombobox, {
  BILLING_LOCATIONS_STORAGE_KEY,
  BILLING_PROVIDERS_STORAGE_KEY,
} from "./LocationCombobox.jsx";
import MedicalCodeCombobox from "./MedicalCodeCombobox.jsx";
import CptLinesEditor from "./CptLinesEditor.jsx";
import BillingDatePicker from "./BillingDatePicker.jsx";

const inputClassName =
  "mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

const CURRENT_YEAR = new Date().getFullYear();

function FieldLabel({ label, children }) {
  return (
    <div className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </div>
  );
}

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

      <FieldLabel label="Patient DOB">
        <BillingDatePicker
          name="patientDob"
          value={form.patientDob}
          onChange={onInputChange}
          inputClassName={inputClassName}
          disableFuture
        />
      </FieldLabel>

      <div
        className={`grid gap-4 md:col-span-2 ${
          form.incidentTo ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
        }`}
      >
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
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              name="incidentTo"
              checked={Boolean(form.incidentTo)}
              onChange={(event) => {
                const checked = event.target.checked;
                setForm((prev) => ({
                  ...prev,
                  incidentTo: checked,
                  attendingName: checked ? prev.attendingName : "",
                }));
              }}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm font-medium text-gray-700">Incident To</span>
          </label>
        </div>
        {form.incidentTo ? (
          <div className="block">
            <LocationCombobox
              storageKey={BILLING_PROVIDERS_STORAGE_KEY}
              label="Attending Name"
              placeholder="Select or type an attending"
              addOptionSuffix="provider"
              value={form.attendingName}
              onChange={(attendingName) => setForm((prev) => ({ ...prev, attendingName }))}
              required
            />
          </div>
        ) : null}
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

      <FieldLabel label="Date Of Service">
        <BillingDatePicker
          name="dateOfService"
          value={form.dateOfService}
          onChange={onInputChange}
          inputClassName={inputClassName}
          fromYear={CURRENT_YEAR - 10}
          disableFuture
        />
      </FieldLabel>

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
