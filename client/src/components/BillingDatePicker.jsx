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
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);

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

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-popover`}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={`${inputClassName} w-full text-left flex items-center justify-between gap-2`}
      >
        <span className={displayValue ? "text-gray-900" : "text-gray-400"}>
          {displayValue || placeholder}
        </span>
        <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

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
