import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const CALL_SCHEDULE_LOCATIONS_STORAGE_KEY = "callScheduleCustomLocations";
export const BILLING_LOCATIONS_STORAGE_KEY = "billingCustomLocations";
export const BILLING_PROVIDERS_STORAGE_KEY = "billingCustomProviders";

function loadCustomLocations(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomLocations(storageKey, locations) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(locations));
}

function DropdownPortal({ open, anchorEl, children }) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuMaxHeightPx = 192;
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
 * Location text field with dropdown of saved custom locations.
 */
export default function LocationCombobox({
  storageKey = CALL_SCHEDULE_LOCATIONS_STORAGE_KEY,
  value,
  onChange,
  label = "Location",
  placeholder = "Location",
  addOptionSuffix = "location",
  required = false,
  inputClassName = "w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500",
}) {
  const [customLocations, setCustomLocations] = useState(() =>
    loadCustomLocations(storageKey)
  );
  const [openPicker, setOpenPicker] = useState(null);
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
      if (!insideDropdown) {
        setOpenPicker(null);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  const allLocationOptions = useMemo(() => {
    const unique = [...new Set(customLocations)];
    return unique.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [customLocations]);

  const trimmedValue = (value || "").trim();

  const removeLocation = (opt) => {
    setCustomLocations((prev) => {
      const next = prev.filter((x) => x !== opt);
      saveCustomLocations(storageKey, next);
      return next;
    });
  };

  const addCurrentAsLocation = () => {
    if (!trimmedValue) return;
    setCustomLocations((prev) => {
      const next = Array.from(new Set([...prev, trimmedValue]));
      saveCustomLocations(storageKey, next);
      return next;
    });
    setOpenPicker(null);
  };

  return (
    <div ref={rootRef} data-dropdown-root="true">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="relative mt-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => setOpenPicker({ anchorEl: e.currentTarget })}
          placeholder={placeholder}
          className={`${inputClassName} pr-8`}
          required={required}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-2 text-gray-400 hover:text-gray-600 text-xs"
          onClick={(e) => {
            setOpenPicker((prev) => {
              if (prev) return null;
              const inputEl =
                e.currentTarget?.parentElement?.querySelector("input") || null;
              return inputEl ? { anchorEl: inputEl } : null;
            });
          }}
          tabIndex={-1}
          aria-label="Show location options"
        >
          ▾
        </button>
      </div>

      <DropdownPortal open={!!openPicker} anchorEl={openPicker?.anchorEl}>
        <div className="rounded-md border border-gray-200 bg-white shadow-lg text-sm">
          {allLocationOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className="block w-full text-left px-3 py-2 hover:bg-gray-100"
              onClick={() => {
                onChange(opt);
                setOpenPicker(null);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{opt}</span>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-500 text-xs px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLocation(opt);
                  }}
                  aria-label={`Delete ${opt} from locations`}
                >
                  ×
                </button>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="block w-full text-left px-3 py-2 border-t border-gray-200 text-teal-700 hover:bg-gray-50"
            onClick={addCurrentAsLocation}
            disabled={!trimmedValue}
          >
            + Add “{trimmedValue || " "}” as {addOptionSuffix}
          </button>
        </div>
      </DropdownPortal>
    </div>
  );
}
