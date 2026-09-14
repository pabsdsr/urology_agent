import { useEffect, useRef, useState } from "react";
import { validateBillingSheetFile } from "../utils/billingFormValidation.js";
import {
  BILLING_SHEET_JPEG_QUALITY,
  scaledBillingSheetSize,
  shrinkBillingSheetImage,
} from "../utils/shrinkBillingSheetImage.js";

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function hasCameraSupport() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export default function BillingSheetInput({ file, onFileChange, onBusyChange }) {
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const applyGenerationRef = useRef(0);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const showCameraButton = !isMobileDevice() && hasCameraSupport();

  const setBusy = (nextBusy) => {
    setPreparing(nextBusy);
    onBusyChange?.(nextBusy);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
  };

  useEffect(() => {
    if (!cameraOpen) {
      stopStream();
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch {
        if (!cancelled) {
          setError("Could not access the camera.");
          setCameraOpen(false);
          stopStream();
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      onBusyChange?.(false);
    };
  }, [onBusyChange]);

  const applySelectedFile = async (nextFile, { alreadyPrepared = false } = {}) => {
    const generation = ++applyGenerationRef.current;
    const validationError = validateBillingSheetFile(nextFile);
    if (validationError) {
      setError(validationError);
      return false;
    }

    setError("");
    setBusy(true);
    try {
      const prepared = alreadyPrepared
        ? nextFile
        : await shrinkBillingSheetImage(nextFile);
      if (generation !== applyGenerationRef.current) {
        return false;
      }
      const preparedError = validateBillingSheetFile(prepared);
      if (preparedError) {
        setError(preparedError);
        return false;
      }
      onFileChange(prepared);
      return true;
    } catch {
      if (generation !== applyGenerationRef.current) {
        return false;
      }
      setError("Could not prepare the billing sheet image.");
      return false;
    } finally {
      if (generation === applyGenerationRef.current) {
        setBusy(false);
      }
    }
  };

  const handleFileInputChange = (event) => {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (!nextFile) return;
    void applySelectedFile(nextFile);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    const { width, height } = scaledBillingSheetSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const captured = new File([blob], `face-sheet-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        void applySelectedFile(captured, { alreadyPrepared: true }).then((accepted) => {
          if (accepted) {
            closeCamera();
          }
        });
      },
      "image/jpeg",
      BILLING_SHEET_JPEG_QUALITY
    );
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {file && (
        <p className="text-sm text-gray-600 mb-2">Selected file: {file.name}</p>
      )}

      {preparing && (
        <p className="text-sm text-gray-600 mb-2">Preparing image…</p>
      )}

      {!cameraOpen && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={preparing}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-teal-300"
          >
            File upload
          </button>
          {showCameraButton && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setCameraOpen(true);
              }}
              disabled={preparing}
              className="px-4 py-2 text-sm font-medium text-teal-700 bg-white border border-teal-600 rounded-md hover:bg-teal-50 disabled:text-gray-400 disabled:border-gray-300"
            >
              Camera
            </button>
          )}
        </div>
      )}

      {cameraOpen && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-h-80 rounded-md border border-gray-300 bg-black object-contain"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={capturePhoto}
              disabled={preparing}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:bg-teal-300"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={closeCamera}
              disabled={preparing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
