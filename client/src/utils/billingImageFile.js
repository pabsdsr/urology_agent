export const MAX_BILLING_IMAGE_BYTES = 10 * 1024 * 1024;

/** MIME types accepted for billing sheet uploads (must match server). */
export const ALLOWED_BILLING_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const EXTENSION_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * Resolve MIME type for a camera/gallery file (iOS often sends "" or image/heif).
 * @param {File | null | undefined} file
 * @returns {string | null}
 */
export function resolveBillingImageMimeType(file) {
  if (!file) return null;

  const rawType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (ALLOWED_BILLING_IMAGE_TYPES.includes(rawType)) {
    return rawType;
  }

  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (ext && EXTENSION_TO_MIME[ext]) {
    return EXTENSION_TO_MIME[ext];
  }

  // iOS camera capture sometimes yields application/octet-stream with no extension
  if (rawType === "application/octet-stream" || rawType === "") {
    return null;
  }

  return null;
}

export function isAllowedBillingImageFile(file) {
  return resolveBillingImageMimeType(file) != null;
}

/**
 * Re-wrap file with a normalized MIME so multipart upload matches server allowlist.
 * @param {File} file
 * @returns {File | null}
 */
export function normalizeBillingImageFile(file) {
  const mime = resolveBillingImageMimeType(file);
  if (!mime) return null;
  if (file.type === mime) {
    return file;
  }
  const name = file.name || `billing-sheet.${mime === "image/heif" ? "heif" : "heic"}`;
  return new File([file], name, { type: mime, lastModified: file.lastModified });
}
