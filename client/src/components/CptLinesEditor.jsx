import { useEffect, useState } from "react";
import MedicalCodeCombobox from "./MedicalCodeCombobox.jsx";
import { EMPTY_CPT_LINE, formatCptLineDisplay } from "../utils/cptLines.js";

function defaultExpandedIndex(lines) {
  const firstWithCode = lines.findIndex((line) => line.code);
  return firstWithCode >= 0 ? firstWithCode : 0;
}

export default function CptLinesEditor({ lines, onChange, resetKey }) {
  const [expandedIndex, setExpandedIndex] = useState(() => defaultExpandedIndex(lines));

  useEffect(() => {
    setExpandedIndex(defaultExpandedIndex(lines));
  }, [resetKey]);

  useEffect(() => {
    if (expandedIndex >= lines.length) {
      setExpandedIndex(Math.max(0, lines.length - 1));
    }
  }, [expandedIndex, lines.length]);

  const updateLine = (index, patch) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index) => {
    if (lines.length <= 1) {
      onChange([{ ...EMPTY_CPT_LINE }]);
      setExpandedIndex(0);
      return;
    }
    const next = lines.filter((_, i) => i !== index);
    onChange(next);
    setExpandedIndex((current) => {
      if (current === index) return Math.min(index, next.length - 1);
      if (current > index) return current - 1;
      return current;
    });
  };

  const addLine = () => {
    const lastIndex = lines.length - 1;
    if (lastIndex >= 0 && !lines[lastIndex].code) {
      setExpandedIndex(lastIndex);
      return;
    }
    onChange([...lines, { ...EMPTY_CPT_LINE }]);
    setExpandedIndex(lines.length);
  };

  const expandedLine = lines[expandedIndex] ?? lines[0];

  return (
    <div className="space-y-3 md:col-span-2">
      <span className="text-sm font-medium text-gray-700">CPT Codes</span>

      <div className="flex flex-wrap items-center gap-2">
        {lines.map((line, index) => {
          if (!line.code) return null;
          const isExpanded = expandedIndex === index;
          return (
            <button
              key={`cpt-chip-${index}`}
              type="button"
              onClick={() => setExpandedIndex(index)}
              aria-expanded={isExpanded}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-mono transition-colors ${
                isExpanded
                  ? "border-teal-500 bg-teal-50 text-teal-900 ring-2 ring-teal-200"
                  : "border-gray-300 bg-white text-gray-900 hover:border-teal-300 hover:bg-teal-50/50"
              }`}
            >
              <span>{formatCptLineDisplay(line)}</span>
              <span className="text-[10px] text-gray-500" aria-hidden="true">
                {isExpanded ? "▴" : "▾"}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={addLine}
          className="text-sm font-medium text-teal-700 hover:text-teal-900 px-1"
        >
          + Add CPT
        </button>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {expandedLine.code || "New CPT line"}
          </span>
          <button
            type="button"
            onClick={() => removeLine(expandedIndex)}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            Remove
          </button>
        </div>

        <MedicalCodeCombobox
          codeType="cpt"
          label="CPT Code"
          placeholder="Search or type a CPT code"
          values={expandedLine.code ? [expandedLine.code] : []}
          maxCodes={1}
          onChangeValues={(codes) => updateLine(expandedIndex, { code: codes[0] || "" })}
        />

        {expandedLine.code ? (
          <MedicalCodeCombobox
            codeType="modifier"
            label="Modifiers"
            placeholder="Search or type a modifier (e.g. 25 or -25)"
            values={expandedLine.modifiers}
            onChangeValues={(modifiers) => updateLine(expandedIndex, { modifiers })}
            inputClassName="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        ) : (
          <p className="text-xs text-gray-500">
            Choose a CPT code above, then add modifiers for that line.
          </p>
        )}
      </div>
    </div>
  );
}
