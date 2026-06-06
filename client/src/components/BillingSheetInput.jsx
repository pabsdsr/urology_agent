import { useEffect, useRef, useState } from "react";
import { validateBillingSheetFile } from "../utils/billingFormValidation.js";

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function hasCameraSupport() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function applySelectedFile(nextFile, onFileChange, setError) {
  const validationError = validateBillingSheetFile(nextFile);
  if (validationError) {
    setError(validationError);
    return false;
  }
  setError("");
  onFileChange(nextFile);
  return true;
}

export default function BillingSheetInput({ file, onFileChange }) {
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const showCameraButton = !isMobileDevice() && hasCameraSupport();

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

  const handleFileInputChange = (event) => {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (!nextFile) return;
    applySelectedFile(nextFile, onFileChange, setError);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const captured = new File([blob], `face-sheet-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        if (applySelectedFile(captured, onFileChange, setError)) {
          closeCamera();
        }
      },
      "image/jpeg",
      0.92
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

      {!cameraOpen && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700"
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
              className="px-4 py-2 text-sm font-medium text-teal-700 bg-white border border-teal-600 rounded-md hover:bg-teal-50"
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
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={closeCamera}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
