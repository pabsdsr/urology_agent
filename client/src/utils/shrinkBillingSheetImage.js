/** Long-edge cap for billing sheet photos before upload. */
export const BILLING_SHEET_MAX_EDGE_PX = 2000;

/** JPEG quality after shrink. Readable on a computer, much smaller than camera originals. */
export const BILLING_SHEET_JPEG_QUALITY = 0.7;

export function scaledBillingSheetSize(
  width,
  height,
  maxEdge = BILLING_SHEET_MAX_EDGE_PX
) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function jpegFileName(originalName) {
  const trimmed = String(originalName || "").trim();
  const base = trimmed.replace(/\.[^.]+$/, "");
  const safe = base.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return `${safe || "billing-sheet"}.jpg`;
}

function closeBitmap(source) {
  if (source && typeof source.close === "function") {
    source.close();
  }
}

async function decodeBillingSheetImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // HEIC and some camera formats fail here; try the HTMLImageElement path.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image"));
    };
    image.src = url;
  });
}

function encodeJpegBlob(source, width, height, quality) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Scale the long edge to at most 2000px and re-encode as JPEG 0.7.
 * Returns the original file when decode/encode fails or the result is larger.
 */
export async function shrinkBillingSheetImage(file) {
  if (!file) return file;

  let source;
  try {
    source = await decodeBillingSheetImage(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = scaledBillingSheetSize(source.width, source.height);
    if (!width || !height) {
      return file;
    }

    const blob = await encodeJpegBlob(source, width, height, BILLING_SHEET_JPEG_QUALITY);
    if (!blob || blob.size <= 0) {
      return file;
    }
    if (blob.size >= file.size && file.type === "image/jpeg") {
      return file;
    }

    return new File([blob], jpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    closeBitmap(source);
  }
}
