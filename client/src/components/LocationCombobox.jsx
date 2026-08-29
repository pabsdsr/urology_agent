import { useMemo, useState } from "react";
import DropdownPortal from "./DropdownPortal.jsx";
import { readJsonStorage, writeJsonStorage } from "../utils/jsonStorage.js";
import { useDropdownDismiss } from "../hooks/useDropdownDismiss.js";
import { BILLING_INPUT_CLASS } from "../utils/billingUi.js";
import {
  getBillingFieldUsage,
  recordBillingFieldUsage,
} from "../utils/billingFieldUsage.js";

export const CALL_SCHEDULE_LOCATIONS_STORAGE_KEY = "callScheduleCustomLocations";
export const CALL_SCHEDULE_PRACTITIONERS_STORAGE_KEY = "callScheduleCustomPractitioners";
export const BILLING_LOCATIONS_STORAGE_KEY = "billingCustomLocations";
export const BILLING_PROVIDERS_STORAGE_KEY = "billingCustomProviders";

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
  inputClassName = BILLING_INPUT_CLASS,
  defaultOptions = [],
  usageKey,
}) {
  const [customLocations, setCustomLocations] = useState(() =>
    readJsonStorage(storageKey)
  );
  const [openPicker, setOpenPicker] = useState(null);
  // Recency ranking is tracked per field so the most recently used
  // providers/locations bubble to the top of the picker. Defaults to storageKey
  // but can be overridden (e.g. attending ranks separately from provider).
  const usageStorageKey = usageKey || `${storageKey}Usage`;
  const [usage, setUsage] = useState(() => getBillingFieldUsage(usageStorageKey));

  useDropdownDismiss(() => setOpenPicker(null));

  // A custom entry that duplicates a shared default (case-insensitive) is
  // overridden by the default: it neither appears twice nor keeps a removable
  // chip.
  const effectiveCustom = useMemo(() => {
    const defaultLower = new Set(defaultOptions.map((o) => o.toLowerCase()));
    return customLocations.filter((o) => !defaultLower.has(o.toLowerCase()));
  }, [defaultOptions, customLocations]);

  // Only user-added entries can be removed; shared defaults are read-only.
  const customSet = useMemo(() => new Set(effectiveCustom), [effectiveCustom]);

  const allLocationOptions = useMemo(() => {
    const unique = [...new Set([...defaultOptions, ...effectiveCustom])];
    const query = (value || "").trim().toLowerCase();
    // Filter as the user types, but once the value exactly matches an option
    // (i.e. a selection was made) show the whole list again so it's easy to switch.
    const exactMatch = unique.some((opt) => opt.toLowerCase() === query);
    const filtered =
      query && !exactMatch
        ? unique.filter((opt) => opt.toLowerCase().includes(query))
        : unique;
    // Most recently used first; never-used options fall back to alphabetical.
    return filtered.sort((a, b) => {
      const la = (usage[a] || {}).lastUsed || 0;
      const lb = (usage[b] || {}).lastUsed || 0;
      if (lb !== la)       return lb - la;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  }, [defaultOptions, effectiveCustom, value, usage]);

  const trimmedValue = (value || "").trim();

  const selectOption = (opt) => {
    onChange(opt);
    recordBillingFieldUsage(usageStorageKey, opt);
    setUsage(getBillingFieldUsage(usageStorageKey));
    setOpenPicker(null);
  };

  const removeLocation = (opt) => {
    setCustomLocations((prev) => {
      const next = prev.filter((x) => x !== opt);
      writeJsonStorage(storageKey, next);
      return next;
    });
  };

  const addCurrentAsLocation = () => {
    if (!trimmedValue) return;
    setCustomLocations((prev) => {
      const next = Array.from(new Set([...prev, trimmedValue]));
      writeJsonStorage(storageKey, next);
      return next;
    });
    recordBillingFieldUsage(usageStorageKey, trimmedValue);
    setUsage(getBillingFieldUsage(usageStorageKey));
    setOpenPicker(null);
  };

  // Enter selects the top option in the (filtered) list; if nothing matches but
  // the user has typed something, add it as a new custom entry.
  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (allLocationOptions.length > 0) {
      selectOption(allLocationOptions[0]);
    } else if (trimmedValue) {
      addCurrentAsLocation();
    }
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
          onKeyDown={handleKeyDown}
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
                onClick={() => selectOption(opt)}
              >
                {opt}
              </button>
              {customSet.has(opt) && (
                <button
                  type="button"
                  className="shrink-0 text-gray-400 hover:text-red-500 text-xs px-2 py-2"
                  onClick={() => removeLocation(opt)}
                  aria-label={`Delete ${opt} from locations`}
                >
                  ×
                </button>
              )}
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
