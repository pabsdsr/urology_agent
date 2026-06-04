import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { billingCodesService } from "../services/billingCodesService.js";

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
 * CPT or ICD-10 field with searchable curated codes; free-text entry always allowed.
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

  const openDropdown = (anchorEl) => {
    setOpenPicker({ anchorEl });
  };

  const selectCode = (code) => {
    onChange(code);
    setOpenPicker(null);
  };

  const trimmed = (value || "").trim();

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
          {loading && (
            <p className="px-3 py-2 text-gray-500">Searching...</p>
          )}
          {!loading && searchError && (
            <p className="px-3 py-2 text-red-600">{searchError}</p>
          )}
          {!loading && !searchError && results.length === 0 && (
            <p className="px-3 py-2 text-gray-500">
              No matches. You can still enter your own code above.
            </p>
          )}
          {!loading &&
            results.map((item) => (
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
          {!loading && trimmed && (
            <button
              type="button"
              className="block w-full text-left px-3 py-2 border-t border-gray-200 text-teal-700 hover:bg-gray-50 font-mono"
              onClick={() => selectCode(trimmed.toUpperCase())}
            >
              Use “{trimmed.toUpperCase()}”
            </button>
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}
