const CPT_MODIFIER_REGEX = /^[A-Z0-9]{2}$/;

export const EMPTY_CPT_LINE = { code: "", modifiers: [] };

/**
 * Split a comma/semicolon-delimited string (or array) into a list of unique,
 * upper-cased codes. Pass `stripDash` to drop a single leading dash, which is
 * used when normalizing CPT modifiers (e.g. "-59" -> "59").
 */
export function parseDelimitedList(value, { stripDash = false } = {}) {
  const normalize = (code) => {
    const trimmed = String(code).trim();
    return (stripDash ? trimmed.replace(/^-/, "") : trimmed).toUpperCase();
  };
  const items = Array.isArray(value) ? value : String(value || "").split(/[,;]+/);
  return [...new Set(items.map(normalize).filter(Boolean))];
}

function isValidCptCode(code) {
  const normalized = String(code).trim().toUpperCase();
  if (normalized.length !== 5 && normalized.length !== 6) return false;
  return [...normalized.slice(0, -1)].every((ch) => ch >= "0" && ch <= "9");
}

function normalizeCptLine(line) {
  return {
    code: String(line?.code || "")
      .trim()
      .toUpperCase(),
    modifiers: parseDelimitedList(line?.modifiers || [], { stripDash: true }),
  };
}

export function normalizeCptLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map(normalizeCptLine);
}

/** @param {{ cpt_lines?: Array, cpt_code?: string, cpt_modifiers?: string }} submission */
export function cptLinesFromSubmission(submission) {
  if (Array.isArray(submission?.cpt_lines) && submission.cpt_lines.length > 0) {
    return normalizeCptLines(submission.cpt_lines);
  }
  const codes = parseDelimitedList(submission?.cpt_code);
  const modifiers = parseDelimitedList(submission?.cpt_modifiers, { stripDash: true });
  if (codes.length === 0) {
    return [{ ...EMPTY_CPT_LINE }];
  }
  return codes.map((code, index) => ({
    code,
    modifiers: index === 0 ? modifiers : [],
  }));
}

export function formatCptLineDisplay(line) {
  const { code, modifiers } = normalizeCptLine(line);
  if (!code) return "";
  if (modifiers.length === 0) return code;
  return `${code}-${modifiers.join(",")}`;
}

export function formatCptLinesDisplay(linesOrSubmission) {
  const lines = Array.isArray(linesOrSubmission)
    ? normalizeCptLines(linesOrSubmission)
    : cptLinesFromSubmission(linesOrSubmission);
  return lines.map(formatCptLineDisplay).filter(Boolean).join(", ");
}

export function serializeCptLinesForApi(lines) {
  const payload = normalizeCptLines(lines)
    .filter((line) => line.code)
    .map(({ code, modifiers }) => ({ code, modifiers }));
  return JSON.stringify(payload);
}

/** @returns {string} Empty when valid, otherwise an error message. */
export function validateCptLines(lines) {
  const normalized = normalizeCptLines(lines).filter((line) => line.code);
  if (normalized.length === 0) {
    return "At least one CPT code is required.";
  }
  for (const line of normalized) {
    if (!isValidCptCode(line.code)) {
      return `CPT code format is invalid: ${line.code}`;
    }
    for (const modifier of line.modifiers) {
      if (!CPT_MODIFIER_REGEX.test(modifier)) {
        return `CPT modifier format is invalid: ${modifier}`;
      }
    }
  }
  return "";
}
