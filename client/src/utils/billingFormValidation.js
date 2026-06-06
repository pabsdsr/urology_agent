const ICD10_REGEX = /^[A-TV-Z][0-9][0-9AB]\.?[0-9A-TV-Z]{0,4}$/i;
const CPT_MODIFIER_REGEX = /^[A-Z0-9]{2}$/;

export const MAX_BILLING_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_BILLING_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];
export const BILLING_IMAGE_ACCEPT = ALLOWED_BILLING_IMAGE_TYPES.join(",");

/** Matches server `_validate_cpt_code`: 5–6 chars with all but the last being digits. */
export function isValidCptCode(code) {
  const normalized = String(code).trim().toUpperCase();
  if (normalized.length !== 5 && normalized.length !== 6) return false;
  return [...normalized.slice(0, -1)].every((ch) => ch >= "0" && ch <= "9");
}

export function parseBillingCodeList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/[,;]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

export function formatBillingCodeList(codes) {
  return parseBillingCodeList(codes).join(", ");
}

export function parseBillingModifierList(value) {
  const normalize = (code) => String(code).trim().replace(/^-/, "").toUpperCase();
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalize).filter(Boolean))];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/[,;]+/)
        .map(normalize)
        .filter(Boolean)
    ),
  ];
}

export function formatBillingModifierList(codes) {
  return parseBillingModifierList(codes).join(", ");
}

export function formatBillingModifierDisplay(value) {
  const codes = parseBillingModifierList(value);
  return codes.length ? codes.map((code) => `-${code}`).join(", ") : "";
}

/** @returns {string} Empty string when valid, otherwise an error message. */
export function validateBillingSheetFile(file) {
  if (!file) return "";
  if (!ALLOWED_BILLING_IMAGE_TYPES.includes(file.type)) {
    return "Billing sheet must be a JPEG, PNG, WebP, or HEIC image.";
  }
  if (file.size > MAX_BILLING_IMAGE_BYTES) {
    return "Billing sheet image exceeds the 10MB limit.";
  }
  return "";
}

/**
 * @param {{ patientName: string, patientDob: string, providerName: string, location: string, dateOfService: string, cptCodes: string[], icd10Codes: string[], cptModifiers?: string[] }} form
 * @param {{ billingSheetFile?: File | null, requireSheet?: boolean }} [options]
 */
export function validateBillingForm(form, { billingSheetFile = null, requireSheet = false } = {}) {
  if (!form.patientName.trim()) return "Patient name is required.";
  if (!form.patientDob?.trim()) return "Patient DOB is required.";
  if (!form.providerName.trim()) return "Provider name is required.";
  if (!form.location.trim()) return "Location is required.";
  if (!form.dateOfService) return "Date of service is required.";

  const cptCodes = parseBillingCodeList(form.cptCodes);
  if (cptCodes.length === 0) return "At least one CPT code is required.";
  for (const code of cptCodes) {
    if (!isValidCptCode(code)) return `CPT code format is invalid: ${code}`;
  }

  const icd10Codes = parseBillingCodeList(form.icd10Codes);
  if (icd10Codes.length === 0) return "At least one ICD-10 code is required.";
  for (const code of icd10Codes) {
    if (!ICD10_REGEX.test(code)) return `ICD-10 code format is invalid: ${code}`;
  }

  for (const modifier of parseBillingModifierList(form.cptModifiers)) {
    if (!CPT_MODIFIER_REGEX.test(modifier)) {
      return `CPT modifier format is invalid: ${modifier}`;
    }
  }

  if (requireSheet && !billingSheetFile) return "Billing sheet image is required.";
  return validateBillingSheetFile(billingSheetFile);
}
