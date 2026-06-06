import { validateCptLines } from "./cptLines.js";

const ICD10_REGEX = /^[A-TV-Z][0-9][0-9AB]\.?[0-9A-TV-Z]{0,4}$/i;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export const BILLING_DATE_PLACEHOLDER = "MM/DD/YYYY";

/** Parse MM/DD/YYYY or legacy YYYY-MM-DD into calendar parts. */
export function parseBillingDateParts(value) {
  const trimmed = String(value || "").trim();
  const usMatch = trimmed.match(US_DATE_REGEX);
  if (usMatch) {
    return {
      month: Number(usMatch[1]),
      day: Number(usMatch[2]),
      year: Number(usMatch[3]),
    };
  }
  const isoMatch = trimmed.match(ISO_DATE_REGEX);
  if (isoMatch) {
    return {
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      year: Number(isoMatch[1]),
    };
  }
  return null;
}

export function isValidBillingDate(value) {
  const parts = parseBillingDateParts(value);
  if (!parts) return false;
  const { month, day, year } = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** Normalize to MM/DD/YYYY for storage and display. */
export function formatBillingDateUs(value) {
  const parts = parseBillingDateParts(value);
  if (!parts) return String(value || "").trim();
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${month}/${day}/${parts.year}`;
}

export const MAX_BILLING_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_BILLING_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];
export const BILLING_IMAGE_ACCEPT = ALLOWED_BILLING_IMAGE_TYPES.join(",");

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
 * @param {{ patientName: string, patientDob: string, providerName: string, location: string, dateOfService: string, cptLines: Array, icd10Codes: string[] }} form
 * @param {{ billingSheetFile?: File | null, requireSheet?: boolean }} [options]
 */
export function validateBillingForm(form, { billingSheetFile = null, requireSheet = false } = {}) {
  if (!form.patientName.trim()) return "Patient name is required.";
  if (!form.patientDob?.trim()) return "Patient DOB is required.";
  if (!isValidBillingDate(form.patientDob)) {
    return `Patient DOB must be a valid date in ${BILLING_DATE_PLACEHOLDER} format.`;
  }
  if (!form.providerName.trim()) return "Provider name is required.";
  if (!form.location.trim()) return "Location is required.";
  if (!form.dateOfService?.trim()) return "Date of service is required.";
  if (!isValidBillingDate(form.dateOfService)) {
    return `Date of service must be a valid date in ${BILLING_DATE_PLACEHOLDER} format.`;
  }

  const cptLinesError = validateCptLines(form.cptLines);
  if (cptLinesError) return cptLinesError;

  const icd10Codes = parseBillingCodeList(form.icd10Codes);
  if (icd10Codes.length === 0) return "At least one ICD-10 code is required.";
  for (const code of icd10Codes) {
    if (!ICD10_REGEX.test(code)) return `ICD-10 code format is invalid: ${code}`;
  }

  if (requireSheet && !billingSheetFile) return "Billing sheet image is required.";
  return validateBillingSheetFile(billingSheetFile);
}
