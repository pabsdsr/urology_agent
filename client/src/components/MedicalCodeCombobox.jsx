import { useEffect, useMemo, useRef, useState } from "react";
import { billingCodesService } from "../services/billingCodesService.js";
import DropdownPortal from "./DropdownPortal.jsx";
import { readJsonStorage, writeJsonStorage } from "../utils/jsonStorage.js";
import { parseBillingCodeList, parseBillingModifierList } from "../utils/billingFormValidation.js";
import {
  getRecentBillingCodes,
  recordBillingCodeUsage,
} from "../utils/billingCodeUsage.js";

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

function normalizeQuery(codeType, query) {
  return codeType === "modifier"
    ? query.trim().replace(/^-/, "").toUpperCase()
    : query.trim().toUpperCase();
}

function loadCustomCodes(storageKey) {
  return readJsonStorage(storageKey)
    .map((c) => String(c).trim())
    .filter(Boolean);
}

function saveCustomCodes(storageKey, codes) {
  writeJsonStorage(storageKey, codes);
}

function CodeResultButton({ codeType, item, onSelect }) {
  return (
    <button
      type="button"
      className="block w-full text-left px-3 py-2 hover:bg-gray-100"
      onClick={() => onSelect(item.code, item.description)}
    >
      <span className="font-mono text-gray-900">{formatCodeLabel(codeType, item.code)}</span>
      {item.description ? <span className="text-gray-600"> — {item.description}</span> : null}
    </button>
  );
}

/**
 * CPT or ICD-10 multi-select with searchable curated codes, recent usage, and saved custom codes.
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
  const inputRef = useRef(null);

  const normalizedQuery = normalizeQuery(codeType, query);
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const handleQueryChange = (event) => {
    const next = event.target.value;
    setQuery(next);
    setOpenPicker(next.trim() ? { anchorEl: event.currentTarget } : null);
  };

  useEffect(() => {
    const handleDocumentClick = (event) => {
      const dropdownRoots = document.querySelectorAll('[data-dropdown-root="true"]');
      const insideDropdown = Array.from(dropdownRoots).some((el) => el.contains(event.target));
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
        if (!cancelled) setResults(codes);
      } catch {
        if (!cancelled) {
          setSearchError("Could not load code suggestions.");
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [openPicker, query, codeType]);

  const recentOptions = useMemo(
    () =>
      getRecentBillingCodes(codeType, { query: normalizedQuery }).filter(
        (item) => !selectedSet.has(item.code.toUpperCase())
      ),
    [codeType, normalizedQuery, selectedSet]
  );

  const recentCodeSet = useMemo(
    () => new Set(recentOptions.map((item) => item.code.toUpperCase())),
    [recentOptions]
  );

  const savedCodeOptions = useMemo(() => {
    const unique = [...new Set(customCodes.map((c) => c.toUpperCase()))];
    const filtered = normalizedQuery
      ? unique.filter((code) => code.includes(normalizedQuery))
      : unique;
    return filtered
      .filter((code) => !selectedSet.has(code) && !recentCodeSet.has(code))
      .sort((a, b) => a.localeCompare(b));
  }, [customCodes, normalizedQuery, selectedSet, recentCodeSet]);

  const apiResults = useMemo(() => {
    const seen = new Set([...savedCodeOptions, ...recentCodeSet]);
    return results.filter((item) => {
      const code = (item.code || "").toUpperCase();
      return code && !selectedSet.has(code) && !seen.has(code);
    });
  }, [results, savedCodeOptions, recentCodeSet, selectedSet]);

  const addCode = (code, description = "") => {
    const upper = String(code).trim().toUpperCase();
    if (!upper) return;

    recordBillingCodeUsage(codeType, upper, description);
    const next =
      maxCodes === 1 ? [upper] : parseCodeValues(codeType, [...selectedCodes, upper]);
    onChangeValues(next);
    setQuery("");
    setOpenPicker(null);
  };

  const removeCode = (code) => {
    onChangeValues(selectedCodes.filter((c) => c !== code.toUpperCase()));
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
    !loading &&
    !searchError &&
    recentOptions.length === 0 &&
    savedCodeOptions.length === 0 &&
    apiResults.length === 0;

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
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder={placeholder}
          className={`${inputClassName} pr-8`}
          autoComplete="off"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-2 text-gray-400 hover:text-gray-600 text-xs"
          onClick={() => {
            if (openPicker) {
              setOpenPicker(null);
            } else if (inputRef.current) {
              setOpenPicker({ anchorEl: inputRef.current });
            }
          }}
          tabIndex={-1}
          aria-label={`Show ${label} suggestions`}
        >
          ▾
        </button>
      </div>

      <DropdownPortal open={!!openPicker} anchorEl={openPicker?.anchorEl}>
        <div className="rounded-md border border-gray-200 bg-white shadow-lg text-sm max-h-72 overflow-y-auto">
          {recentOptions.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
                Frequently used
              </p>
              {recentOptions.map((item) => (
                <CodeResultButton
                  key={`recent-${item.code}`}
                  codeType={codeType}
                  item={item}
                  onSelect={addCode}
                />
              ))}
            </div>
          )}

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
          {!loading && searchError && <p className="px-3 py-2 text-red-600">{searchError}</p>}
          {!loading &&
            apiResults.map((item) => (
              <CodeResultButton
                key={item.code}
                codeType={codeType}
                item={item}
                onSelect={addCode}
              />
            ))}

          {showEmptyHint && (
            <p className="px-3 py-2 text-gray-500">No matches. Type a code and add it below.</p>
          )}

          <button
            type="button"
            className="sticky bottom-0 block w-full text-left px-3 py-2 border-t border-gray-200 bg-white text-teal-700 hover:bg-gray-50 font-mono"
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
