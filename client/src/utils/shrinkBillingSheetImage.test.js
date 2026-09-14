import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_SHEET_MAX_EDGE_PX,
  jpegFileName,
  scaledBillingSheetSize,
  shrinkBillingSheetImage,
} from "./shrinkBillingSheetImage.js";

describe("scaledBillingSheetSize", () => {
  it("leaves images at or under the long-edge cap unchanged", () => {
    expect(scaledBillingSheetSize(2000, 1500)).toEqual({ width: 2000, height: 1500 });
    expect(scaledBillingSheetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("scales the long edge to 2000px and preserves aspect ratio", () => {
    expect(scaledBillingSheetSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(scaledBillingSheetSize(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });

  it("uses the provided max edge", () => {
    expect(scaledBillingSheetSize(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });
});

describe("jpegFileName", () => {
  it("replaces the extension with .jpg", () => {
    expect(jpegFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(jpegFileName("sheet.png")).toBe("sheet.jpg");
  });

  it("falls back when the name is empty", () => {
    expect(jpegFileName("")).toBe("billing-sheet.jpg");
  });
});

describe("shrinkBillingSheetImage", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the original file when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("unsupported");
    }));
    vi.stubGlobal(
      "Image",
      class {
        set src(_value) {
          queueMicrotask(() => this.onerror?.(new Event("error")));
        }
      }
    );

    const original = new File([new Uint8Array(64)], "sheet.heic", { type: "image/heic" });
    const result = await shrinkBillingSheetImage(original);
    expect(result).toBe(original);
  });

  it("returns a JPEG whose long edge is at most 2000px", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close }))
    );

    const canvases = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const el = originalCreateElement(tagName);
      if (String(tagName).toLowerCase() === "canvas") {
        canvases.push(el);
      }
      return el;
    });

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "",
    }));
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
      callback(new Blob([new Uint8Array(200)], { type: "image/jpeg" }));
    };

    const original = new File([new Uint8Array(4000)], "face-sheet.png", { type: "image/png" });
    const result = await shrinkBillingSheetImage(original);

    expect(result).not.toBe(original);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("face-sheet.jpg");
    expect(result.size).toBe(200);
    expect(close).toHaveBeenCalled();
    expect(canvases[0].width).toBe(2000);
    expect(canvases[0].height).toBe(1500);
    expect(BILLING_SHEET_MAX_EDGE_PX).toBe(2000);
  });

  it("keeps the original JPEG when re-encoding would make it larger", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }))
    );
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "",
    }));
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
      callback(new Blob([new Uint8Array(8000)], { type: "image/jpeg" }));
    };

    const original = new File([new Uint8Array(400)], "small.jpg", { type: "image/jpeg" });
    const result = await shrinkBillingSheetImage(original);
    expect(result).toBe(original);
  });
});
