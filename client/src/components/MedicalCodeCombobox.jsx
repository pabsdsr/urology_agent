import { useEffect, useMemo, useRef, useState } from "react";
import { billingCodesService } from "../services/billingCodesService.js";
import DropdownPortal from "./DropdownPortal.jsx";
import { readJsonStorage, writeJsonStorage } from "../utils/jsonStorage.js";
import { parseBillingCodeList, parseBillingModifierList } from "../utils/billingFormValidation.js";

const CUSTOM_CODE_STORAGE_KEYS = {
  cpt: "billingCustomCptCodes",
  icd10: "billingCustomIcd10Codes",
  modifier: "billingCustomCptModifiers",
};

const CODE_TYPE_LABELS = {
  cpt: "CPT code",
  icd10: "ICD-10 code",
  modifier: "CPT modifier",
};

function parseCodeValues(codeType, values) {
  return codeType === "modifier" ? parseBillingModifierList(values) : parseBillingCodeList(values);
}

function formatCodeLabel(codeType, code) {
  return codeType === "modifier" ? `-${code}` : code;
}

function loadCustomCodes(storageKey) {
  return readJsonStorage(storageKey)
    .map((c) => String(c).trim())
    .filter(Boolean);
}

function saveCustomCodes(storageKey, codes) {
  writeJsonStorage(storageKey, codes);
}

/**
 * CPT or ICD-10 multi-select with searchable curated codes and saved custom codes.
 */
export default function MedicalCodeCombobox({
  codeType,
  values,
  onChangeValues,
  label,
  placeholder,
  maxCodes,
  inputClassName = "w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500",
}) {
  const storageKey = CUSTOM_CODE_STORAGE_KEYS[codeType];
  const codeTypeLabel = CODE_TYPE_LABELS[codeType] || "code";
  const selectedCodes = parseCodeValues(codeType, values);

  const [customCodes, setCustomCodes] = useState(() => loadCustomCodes(storageKey));
  const [query, setQuery] = useState("");
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
          codeType === "icd10"
            ? billingCodesService.searchIcd10
            : codeType === "modifier"
              ? billingCodesService.searchModifiers
              : billingCodesService.searchCpt;
        const codes = await search(query.trim(), 20);
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
  }, [openPicker, query, codeType]);

  const normalizedQuery =
    codeType === "modifier"
      ? query.trim().replace(/^-/, "").toUpperCase()
      : query.trim().toUpperCase();
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const savedCodeOptions = useMemo(() => {
    const unique = [...new Set(customCodes.map((c) => c.toUpperCase()))];
    const filtered = normalizedQuery
      ? unique.filter((code) => code.includes(normalizedQuery))
      : unique;
    return filtered.filter((code) => !selectedSet.has(code)).sort((a, b) => a.localeCompare(b));
  }, [customCodes, normalizedQuery, selectedSet]);

  const apiResults = useMemo(() => {
    const seen = new Set(savedCodeOptions);
    return results.filter((item) => {
      const code = (item.code || "").toUpperCase();
      return code && !selectedSet.has(code) && !seen.has(code);
    });
  }, [results, savedCodeOptions, selectedSet]);

  const addCode = (code) => {
    const upper = String(code).trim().toUpperCase();
    if (!upper) return;
    let next =
      maxCodes === 1
        ? [upper]
        : parseCodeValues(codeType, [...selectedCodes, upper]);
    onChangeValues(next);
    setQuery("");
    setOpenPicker(null);
  };

  const removeCode = (code) => {
    const upper = code.toUpperCase();
    onChangeValues(selectedCodes.filter((c) => c !== upper));
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
    if (!normalizedQuery) return;
    setCustomCodes((prev) => {
      const next = Array.from(new Set([...prev.map((c) => c.toUpperCase()), normalizedQuery]));
      saveCustomCodes(storageKey, next);
      return next;
    });
    addCode(normalizedQuery);
  };

  const showEmptyHint =
    !loading && !searchError && savedCodeOptions.length === 0 && apiResults.length === 0;

  return (
    <div ref={rootRef} className="block">
      {label ? <span className="text-sm font-medium text-gray-700">{label}</span> : null}

      {selectedCodes.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {selectedCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-1 text-sm font-mono text-teal-900"
            >
              {formatCodeLabel(codeType, code)}
              <button
                type="button"
                onClick={() => removeCode(code)}
                className="text-teal-600 hover:text-teal-900 text-xs leading-none"
                aria-label={`Remove ${code}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative mt-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => setOpenPicker({ anchorEl: e.currentTarget })}
          placeholder={placeholder}
          className={`${inputClassName} pr-8`}
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
              setOpenPicker({ anchorEl: inputEl });
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
            <div key={`saved-${code}`} className="flex items-center hover:bg-gray-100">
              <button
                type="button"
                className="flex-1 text-left px-3 py-2 font-mono text-gray-900"
                onClick={() => addCode(code)}
              >
                {formatCodeLabel(codeType, code)}
              </button>
              <button
                type="button"
                className="shrink-0 text-gray-400 hover:text-red-500 text-xs px-2 py-2"
                onClick={() => removeCustomCode(code)}
                aria-label={`Remove ${code} from saved codes`}
              >
                ×
              </button>
            </div>
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
                onClick={() => addCode(item.code)}
              >
                <span className="font-mono text-gray-900">
                  {formatCodeLabel(codeType, item.code)}
                </span>
                <span className="text-gray-600"> — {item.description}</span>
              </button>
            ))}

          {showEmptyHint && (
            <p className="px-3 py-2 text-gray-500">
              No matches. Type a code and add it below.
            </p>
          )}

          <button
            type="button"
            className="block w-full text-left px-3 py-2 border-t border-gray-200 text-teal-700 hover:bg-gray-50 font-mono"
            onClick={addCurrentAsCustomCode}
            disabled={!normalizedQuery || selectedSet.has(normalizedQuery)}
          >
            + Add “{normalizedQuery || " "}” as {codeTypeLabel}
          </button>
        </div>
      </DropdownPortal>
    </div>
  );
}
