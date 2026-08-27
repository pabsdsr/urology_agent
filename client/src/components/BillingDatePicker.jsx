import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  formatBillingDateIso,
  formatBillingDateUs,
  isValidBillingDate,
  parseBillingDate,
} from "../utils/billingFormValidation.js";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DROPDOWN_CLASS =
  "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

function buildYearOptions(fromYear, toYear) {
  return Array.from({ length: toYear - fromYear + 1 }, (_, index) => toYear - index);
}

function calendarDays(viewDate) {
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  return eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });
}

function dayButtonClass({ inMonth, isEndpoint, inRange, isDisabled }) {
  if (isEndpoint) return "bg-teal-600 text-white font-medium";
  if (isDisabled) return "text-gray-300 opacity-40 cursor-not-allowed hover:bg-transparent";
  if (inRange) return "bg-teal-50 text-teal-900 hover:bg-teal-100";
  if (inMonth) return "text-gray-900 hover:bg-teal-50";
  return "text-gray-300 hover:bg-gray-50";
}

// Progressively insert slashes as the user types digits (MM/DD/YYYY). Keeping
// input numeric lets mobile keyboards show the number pad instead of the full
// keyboard, and the mask supplies the "/" separators automatically.
function maskUsDate(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

// Mask an optional start–end range. The first 8 digits form the start date; a
// 9th digit begins the end date and auto-inserts the separator, so a mobile
// number pad (no "/" or "–" keys) can still enter a full range.
function maskUsDateRange(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 16);
  const start = maskUsDate(digits.slice(0, 8));
  if (digits.length <= 8) return start;
  return `${start} – ${maskUsDate(digits.slice(8))}`;
}

// Split a typed range into its date parts. Dates use "/", so a hyphen, en dash,
// or the word "to" is unambiguously the range separator.
function splitTypedRange(text) {
  return String(text || "")
    .split(/\s*(?:–|-|to)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function BillingDatePicker({
  name,
  value,
  onChange,
  inputClassName,
  fromYear = 1900,
  toYear = new Date().getFullYear(),
  disableFuture = false,
  placeholder = "Select date",
  range = false,
  endValue = "",
  onRangeChange,
}) {
  const id = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const [typedText, setTypedText] = useState("");

  const selectedStart = parseBillingDate(value);
  const selectedEnd = parseBillingDate(endValue);
  const maxDate = disableFuture ? startOfDay(new Date()) : null;
  const [viewDate, setViewDate] = useState(() => selectedStart || new Date());

  useEffect(() => {
    if (selectedStart) setViewDate(selectedStart);
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;

    const close = () => setOpen(false);
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Reset the in-progress range selection whenever the popover opens/closes.
  useEffect(() => {
    setDraftStart(null);
    setHoverDate(null);
  }, [open]);

  const yearOptions = useMemo(() => buildYearOptions(fromYear, toYear), [fromYear, toYear]);
  const days = useMemo(() => calendarDays(viewDate), [viewDate]);

  // Highlighted endpoints. While picking a range, the pending start wins and the
  // end follows the hovered day; otherwise the committed start/end are shown.
  // In single mode there is no end, so the same logic drives both modes.
  const previewEnd = draftStart && hoverDate && isAfter(hoverDate, draftStart) ? hoverDate : null;
  const rangeStart = draftStart || selectedStart;
  const rangeEnd = !range ? null : draftStart ? previewEnd : selectedEnd;

  const startText = selectedStart ? formatBillingDateUs(value) : "";
  const endText = range && selectedEnd ? formatBillingDateUs(endValue) : "";
  const displayValue =
    endText && endText !== startText ? `${startText} – ${endText}` : startText;

  // Keep the typable input in sync with the committed value (external changes,
  // calendar selections, resets) without clobbering what the user is typing.
  useEffect(() => {
    setTypedText(range ? displayValue : startText);
  }, [range, displayValue, startText]);

  const handleTypedChange = (event) => {
    const masked = maskUsDate(event.target.value);
    setTypedText(masked);
    // Commit as soon as a complete, valid date is typed so downstream form
    // state and the calendar view update live.
    if (masked.length === 10 && isValidBillingDate(masked)) {
      onChange({ target: { name, value: formatBillingDateIso(masked) } });
    } else if (masked === "") {
      onChange({ target: { name, value: "" } });
    }
  };

  const commitTypedText = () => {
    const trimmed = typedText.trim();
    if (!trimmed) {
      onChange({ target: { name, value: "" } });
      return;
    }
    if (isValidBillingDate(trimmed)) {
      const iso = formatBillingDateIso(trimmed);
      onChange({ target: { name, value: iso } });
      setTypedText(formatBillingDateUs(iso));
    } else {
      // Invalid entry: revert to the last committed value.
      setTypedText(startText);
    }
  };

  const handleTypedRangeChange = (event) => {
    const masked = maskUsDateRange(event.target.value);
    setTypedText(masked);
    if (masked === "") {
      onRangeChange("", "");
      return;
    }
    const [startPart, endPart] = splitTypedRange(masked);
    const startValid = startPart && startPart.length === 10 && isValidBillingDate(startPart);
    if (!startValid) return;
    const startIso = formatBillingDateIso(startPart);
    // Only attach an end once it's a complete, valid date on/after the start.
    if (endPart && endPart.length === 10 && isValidBillingDate(endPart)) {
      const endIso = formatBillingDateIso(endPart);
      onRangeChange(startIso, isBefore(parseBillingDate(endPart), parseBillingDate(startPart)) ? "" : endIso);
    } else {
      onRangeChange(startIso, "");
    }
  };

  const commitTypedRange = () => {
    const trimmed = typedText.trim();
    if (!trimmed) {
      onRangeChange("", "");
      return;
    }
    const [startPart, endPart] = splitTypedRange(trimmed);
    if (!startPart || !isValidBillingDate(startPart)) {
      setTypedText(displayValue);
      return;
    }
    const startIso = formatBillingDateIso(startPart);
    const hasValidEnd = endPart && isValidBillingDate(endPart);
    const endIso =
      hasValidEnd && !isBefore(parseBillingDate(endPart), parseBillingDate(startPart))
        ? formatBillingDateIso(endPart)
        : "";
    onRangeChange(startIso, endIso);
    const startUs = formatBillingDateUs(startIso);
    const endUs = endIso ? formatBillingDateUs(endIso) : "";
    setTypedText(endUs && endUs !== startUs ? `${startUs} – ${endUs}` : startUs);
  };

  const selectSingle = (day) => {
    onChange({ target: { name, value: formatBillingDateIso(day) } });
    setOpen(false);
  };

  const selectRange = (day) => {
    // No pending start yet, or the click lands before it: (re)start the selection.
    if (!draftStart || isBefore(day, draftStart)) {
      setDraftStart(day);
      onRangeChange(formatBillingDateIso(day), "");
      return;
    }
    // Second click on or after the start commits the range (same day = single date).
    const endIso = isSameDay(day, draftStart) ? "" : formatBillingDateIso(day);
    onRangeChange(formatBillingDateIso(draftStart), endIso);
    setDraftStart(null);
    setOpen(false);
  };

  const handleDayClick = (day) => (range ? selectRange(day) : selectSingle(day));

  const setViewPart = (part, nextValue) => {
    setViewDate((current) =>
      part === "month"
        ? new Date(current.getFullYear(), nextValue, 1)
        : new Date(nextValue, current.getMonth(), 1)
    );
  };

  const calendarIcon = (
    <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  return (
    <div ref={rootRef} className="relative mt-1">
      <div
        className={`${inputClassName} !p-0 flex items-center justify-between gap-1 overflow-hidden focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500`}
      >
        <input
          ref={inputRef}
          type="text"
          id={`${id}-trigger`}
          name={name}
          value={typedText}
          inputMode="numeric"
          autoComplete="off"
          placeholder={range ? "MM/DD/YYYY – MM/DD/YYYY" : "MM/DD/YYYY"}
          onChange={range ? handleTypedRangeChange : handleTypedChange}
          onBlur={range ? commitTypedRange : commitTypedText}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (range) commitTypedRange();
              else commitTypedText();
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="w-full bg-transparent px-3 py-2 outline-none placeholder:text-gray-400"
        />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${id}-popover`}
          aria-label="Open calendar"
          onClick={() => setOpen((isOpen) => !isOpen)}
          className="shrink-0 px-2 py-2 text-gray-400 hover:text-gray-600"
        >
          {calendarIcon}
        </button>
      </div>

      {open && (
        <div
          id={`${id}-popover`}
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-3 grid grid-cols-2 gap-2">
            <select
              aria-label="Month"
              value={viewDate.getMonth()}
              onChange={(event) => setViewPart("month", Number(event.target.value))}
              className={DROPDOWN_CLASS}
            >
              {MONTHS.map((label, index) => (
                <option key={label} value={index}>{label}</option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={viewDate.getFullYear()}
              onChange={(event) => setViewPart("year", Number(event.target.value))}
              className={DROPDOWN_CLASS}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {range && (
            <p className="mb-2 text-xs text-gray-500">
              {draftStart
                ? "Select the end date (or the same day for a single date)."
                : "Select a start date, then an end date for a range."}
            </p>
          )}

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="text-center text-xs font-medium text-gray-500 py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewDate);
              const isDisabled = maxDate && isAfter(startOfDay(day), maxDate);
              const isToday = isSameDay(day, new Date());

              const isEndpoint =
                (rangeStart && isSameDay(day, rangeStart)) ||
                (rangeEnd && isSameDay(day, rangeEnd));
              const inRange =
                rangeStart &&
                rangeEnd &&
                isAfter(day, rangeStart) &&
                isBefore(day, rangeEnd);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => range && draftStart && setHoverDate(day)}
                  className={`h-9 w-full rounded-md text-sm transition-colors ${dayButtonClass({
                    inMonth,
                    isEndpoint,
                    inRange,
                    isDisabled,
                  })} ${isToday && !isEndpoint ? "ring-1 ring-teal-300" : ""}`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
