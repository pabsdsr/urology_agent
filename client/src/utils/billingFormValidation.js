import {
  isAllowedBillingImageFile,
  MAX_BILLING_IMAGE_BYTES,
} from "./billingImageFile.js";

export { MAX_BILLING_IMAGE_BYTES } from "./billingImageFile.js";

const CPT_REGEX = /^[0-9]{5}([A-Z]{1})?$/;
const ICD10_REGEX = /^[A-TV-Z][0-9][0-9AB]\.?[0-9A-TV-Z]{0,4}$/i;

/**
 * @param {{ patientName: string, patientDob: string, providerName: string, location: string, dateOfService: string, cptCode: string, icd10Code: string }} form
 * @param {{ billingSheetFile?: File | null, requireSheet?: boolean }} [options]
 */
export function validateBillingForm(form, { billingSheetFile = null, requireSheet = false } = {}) {
  if (!form.patientName.trim()) return "Patient name is required.";
  if (!form.patientDob) return "Patient DOB is required.";
  if (!form.providerName.trim()) return "Provider name is required.";
  if (!form.location.trim()) return "Location is required.";
  if (!form.dateOfService) return "Date of service is required.";
  if (!CPT_REGEX.test(form.cptCode.trim().toUpperCase())) return "CPT code format is invalid.";
  if (!ICD10_REGEX.test(form.icd10Code.trim().toUpperCase())) {
    return "ICD-10 code format is invalid.";
  }
  if (requireSheet && !billingSheetFile) return "Billing sheet image is required.";
  if (billingSheetFile) {
    if (!isAllowedBillingImageFile(billingSheetFile)) {
      return "Billing sheet must be a JPEG, PNG, WebP, or HEIC/HEIF image.";
    }
    if (billingSheetFile.size > MAX_BILLING_IMAGE_BYTES) {
      return "Billing sheet image exceeds the 10MB limit.";
    }
  }
  return "";
}
