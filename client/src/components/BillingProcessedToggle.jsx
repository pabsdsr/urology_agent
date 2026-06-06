/** Checkbox for marking a billing submission as processed. */
export default function BillingProcessedToggle({
  checked,
  disabled,
  busy,
  onChange,
  compact = false,
}) {
  const label = busy
    ? compact
      ? "Saving..."
      : "Updating..."
    : checked
      ? compact
        ? "Yes"
        : "Processed"
      : compact
        ? "No"
        : "Mark as processed";

  return (
    <label
      className={`inline-flex items-center gap-2 ${disabled ? "cursor-default opacity-75" : "cursor-pointer"} ${compact ? "" : "text-sm text-gray-700"}`}
      onClick={compact ? (event) => event.stopPropagation() : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || busy}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
      />
      <span className={compact ? "text-gray-700" : "font-medium"}>{label}</span>
    </label>
  );
}
