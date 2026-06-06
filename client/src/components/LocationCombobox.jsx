import { useEffect, useMemo, useState } from "react";
import DropdownPortal from "./DropdownPortal.jsx";
import { readJsonStorage, writeJsonStorage } from "../utils/jsonStorage.js";

export const CALL_SCHEDULE_LOCATIONS_STORAGE_KEY = "callScheduleCustomLocations";
export const CALL_SCHEDULE_PRACTITIONERS_STORAGE_KEY = "callScheduleCustomPractitioners";
export const BILLING_LOCATIONS_STORAGE_KEY = "billingCustomLocations";
export const BILLING_PROVIDERS_STORAGE_KEY = "billingCustomProviders";

function loadCustomLocations(storageKey) {
  return readJsonStorage(storageKey);
}

function saveCustomLocations(storageKey, locations) {
  writeJsonStorage(storageKey, locations);
}

/**
 * Location text field with dropdown of saved custom locations.
 */
export default function LocationCombobox({
  storageKey,
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
    <div data-dropdown-root="true">
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

      <DropdownPortal open={!!openPicker} anchorEl={openPicker?.anchorEl} menuMaxHeightPx={192}>
        <div className="rounded-md border border-gray-200 bg-white shadow-lg text-sm">
          {allLocationOptions.map((opt) => (
            <div
              key={opt}
              className="flex items-center hover:bg-gray-100"
            >
              <button
                type="button"
                className="flex-1 text-left px-3 py-2"
                onClick={() => {
                  onChange(opt);
                  setOpenPicker(null);
                }}
              >
                {opt}
              </button>
              <button
                type="button"
                className="shrink-0 text-gray-400 hover:text-red-500 text-xs px-2 py-2"
                onClick={() => removeLocation(opt)}
                aria-label={`Delete ${opt} from locations`}
              >
                ×
              </button>
            </div>
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
