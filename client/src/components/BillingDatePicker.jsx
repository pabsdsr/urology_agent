import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
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

function dayButtonClass({ inMonth, isSelected, isDisabled, isToday }) {
  if (isSelected) return "bg-teal-600 text-white font-medium";
  if (isDisabled) return "text-gray-300 opacity-40 cursor-not-allowed hover:bg-transparent";
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
}) {
  const id = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedDate = parseBillingDate(value);
  const maxDate = disableFuture ? startOfDay(new Date()) : null;
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
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

  const yearOptions = useMemo(() => buildYearOptions(fromYear, toYear), [fromYear, toYear]);
  const days = useMemo(() => calendarDays(viewDate), [viewDate]);
  const displayValue = selectedDate ? formatBillingDateUs(value) : "";

  const selectDate = (date) => {
    onChange({ target: { name, value: formatBillingDateIso(date) } });
    setOpen(false);
  };

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
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isDisabled = maxDate && isAfter(startOfDay(day), maxDate);
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDate(day)}
                  className={`h-9 w-full rounded-md text-sm transition-colors ${dayButtonClass({
                    inMonth,
                    isSelected,
                    isDisabled,
                    isToday,
                  })} ${isToday && !isSelected ? "ring-1 ring-teal-300" : ""}`}
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
