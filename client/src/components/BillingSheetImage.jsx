import { useEffect, useState } from "react";
import apiClient from "../services/apiClient.js";
import { billingService } from "../services/billingService.js";

function BillingSheetImage({ submissionId, reloadKey = 0 }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      setError("");
      setSrc(null);
      try {
        const response = await apiClient.get(billingService.billingSheetUrl(submissionId), {
          responseType: "blob",
        });
        if (!response.data || response.data.size === 0) {
          throw new Error("Billing sheet image is empty.");
        }
        objectUrl = URL.createObjectURL(response.data);
        if (!cancelled) {
          setSrc(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          if (err.response?.status === 404) {
            setError("missing");
            return;
          }
          const detail = err.response?.data;
          let message = err.message || "Failed to load image.";
          if (detail instanceof Blob) {
            try {
              const text = await detail.text();
              const parsed = JSON.parse(text);
              if (parsed?.detail) message = parsed.detail;
            } catch {
              // keep default message
            }
          } else if (typeof detail === "object" && detail?.detail) {
            message = detail.detail;
          }
          setError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [submissionId, reloadKey]);

  if (error) {
    return (
      <p className="text-sm text-gray-500">
        {error === "missing" ? "No billing sheet attached." : error}
      </p>
    );
  }
  if (!src) {
    return <p className="text-sm text-gray-500">Loading image...</p>;
  }
  return (
    <img
      src={src}
      alt="Billing sheet"
      className="max-h-96 rounded border border-gray-200"
    />
  );
}

export default BillingSheetImage;
