import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { billingCodesService } from "../services/billingCodesService.js";

export const BILLING_CUSTOM_CPT_STORAGE_KEY = "billingCustomCptCodes";
export const BILLING_CUSTOM_ICD10_STORAGE_KEY = "billingCustomIcd10Codes";

const CUSTOM_CODE_STORAGE_KEYS = {
  cpt: BILLING_CUSTOM_CPT_STORAGE_KEY,
  icd10: BILLING_CUSTOM_ICD10_STORAGE_KEY,
};

const CODE_TYPE_LABELS = {
  cpt: "CPT code",
  icd10: "ICD-10 code",
};

function loadCustomCodes(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((c) => String(c).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveCustomCodes(storageKey, codes) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(codes));
}

function DropdownPortal({ open, anchorEl, children }) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuMaxHeightPx = 240;
      const gapPx = 4;
      const availableBelow = Math.max(80, window.innerHeight - rect.bottom - gapPx - 8);
      const maxHeight = Math.min(menuMaxHeightPx, availableBelow);

      setStyle({
        position: "fixed",
        top: rect.bottom + gapPx,
        left: rect.left,
        width: rect.width,
        maxHeight,
        overflow: "auto",
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  if (!open || !anchorEl || !style) return null;

  return createPortal(
    <div data-dropdown-root="true" style={style} className="z-[99999]">
      {children}
    </div>,
    document.body
  );
}

/**
 * CPT or ICD-10 field with searchable curated codes and saved custom codes (localStorage).
 */
export default function MedicalCodeCombobox({
  codeType,
  value,
  onChange,
  label,
  placeholder,
  required = false,
  inputClassName = "w-full border border-gray-300 rounded-md px-3 py-2 uppercase focus:ring-2 focus:ring-teal-500 focus:border-teal-500",
}) {
  const storageKey = CUSTOM_CODE_STORAGE_KEYS[codeType];
  const codeTypeLabel = CODE_TYPE_LABELS[codeType] || "code";

  const [customCodes, setCustomCodes] = useState(() => loadCustomCodes(storageKey));
  const [openPicker, setOpenPicker] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      const dropdownRoots = document.querySelectorAll('[data-dropdown-root="true"]');
      let insideDropdown = false;
      dropdownRoots.forEach((el) => {
        if (el.contains(event.target)) {
          insideDropdown = true;
        }
      });
      if (!insideDropdown && rootRef.current && !rootRef.current.contains(event.target)) {
        setOpenPicker(null);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  useEffect(() => {
    if (!openPicker) return undefined;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const search =
          codeType === "icd10" ? billingCodesService.searchIcd10 : billingCodesService.searchCpt;
        const codes = await search((value || "").trim(), 20);
        if (!cancelled) {
          setResults(codes);
        }
      } catch {
        if (!cancelled) {
          setSearchError("Could not load code suggestions.");
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [openPicker, value, codeType]);

  const trimmed = (value || "").trim();
  const normalizedTrimmed = trimmed.toUpperCase();

  const savedCodeOptions = useMemo(() => {
    const unique = [...new Set(customCodes.map((c) => c.toUpperCase()))];
    const query = normalizedTrimmed;
    const filtered = query
      ? unique.filter((code) => code.includes(query))
      : unique;
    return filtered.sort((a, b) => a.localeCompare(b));
  }, [customCodes, normalizedTrimmed]);

  const apiResults = useMemo(() => {
    const savedSet = new Set(savedCodeOptions);
    return results.filter((item) => !savedSet.has((item.code || "").toUpperCase()));
  }, [results, savedCodeOptions]);

  const openDropdown = (anchorEl) => {
    setOpenPicker({ anchorEl });
  };

  const selectCode = (code) => {
    onChange(code);
    setOpenPicker(null);
  };

  const removeCustomCode = (code) => {
    const upper = code.toUpperCase();
    setCustomCodes((prev) => {
      const next = prev.filter((c) => c.toUpperCase() !== upper);
      saveCustomCodes(storageKey, next);
      return next;
    });
  };

  const addCurrentAsCustomCode = () => {
    if (!normalizedTrimmed) return;
    setCustomCodes((prev) => {
      const next = Array.from(
        new Set([...prev.map((c) => c.toUpperCase()), normalizedTrimmed])
      );
      saveCustomCodes(storageKey, next);
      return next;
    });
    onChange(normalizedTrimmed);
    setOpenPicker(null);
  };

  const showEmptyHint =
    !loading &&
    !searchError &&
    savedCodeOptions.length === 0 &&
    apiResults.length === 0;

  return (
    <div ref={rootRef} className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="relative mt-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => openDropdown(e.currentTarget)}
          placeholder={placeholder}
          className={`${inputClassName} pr-8`}
          required={required}
          autoComplete="off"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-2 text-gray-400 hover:text-gray-600 text-xs"
          onClick={(e) => {
            const inputEl = e.currentTarget?.parentElement?.querySelector("input");
            if (openPicker) {
              setOpenPicker(null);
            } else if (inputEl) {
              openDropdown(inputEl);
            }
          }}
          tabIndex={-1}
          aria-label={`Show ${label} suggestions`}
        >
          ▾
        </button>
      </div>

      <DropdownPortal open={!!openPicker} anchorEl={openPicker?.anchorEl}>
        <div className="rounded-md border border-gray-200 bg-white shadow-lg text-sm">
          {savedCodeOptions.map((code) => (
            <button
              key={`saved-${code}`}
              type="button"
              className="block w-full text-left px-3 py-2 hover:bg-gray-100"
              onClick={() => selectCode(code)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-gray-900">{code}</span>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-500 text-xs px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCustomCode(code);
                  }}
                  aria-label={`Remove ${code} from saved codes`}
                >
                  ×
                </button>
              </div>
            </button>
          ))}

          {loading && <p className="px-3 py-2 text-gray-500">Searching...</p>}
          {!loading && searchError && (
            <p className="px-3 py-2 text-red-600">{searchError}</p>
          )}
          {!loading &&
            apiResults.map((item) => (
              <button
                key={item.code}
                type="button"
                className="block w-full text-left px-3 py-2 hover:bg-gray-100"
                onClick={() => selectCode(item.code)}
              >
                <span className="font-mono text-gray-900">{item.code}</span>
                <span className="text-gray-600"> — {item.description}</span>
              </button>
            ))}

          {showEmptyHint && (
            <p className="px-3 py-2 text-gray-500">
              No matches. Type a code and add it to your list below.
            </p>
          )}

          <button
            type="button"
            className="block w-full text-left px-3 py-2 border-t border-gray-200 text-teal-700 hover:bg-gray-50 font-mono"
            onClick={addCurrentAsCustomCode}
            disabled={!normalizedTrimmed}
          >
            + Add “{normalizedTrimmed || " "}” as {codeTypeLabel}
          </button>
        </div>
      </DropdownPortal>
    </div>
  );
}
