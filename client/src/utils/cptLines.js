const CPT_MODIFIER_REGEX = /^[A-Z0-9]{2}$/;

export const EMPTY_CPT_LINE = { code: "", modifiers: [] };

function parseCodeList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/[,;]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function parseModifierList(value) {
  const normalize = (code) => String(code).trim().replace(/^-/, "").toUpperCase();
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalize).filter(Boolean))];
  }
  return [
    ...new Set(
      String(value || "")
        .split(/[,;]+/)
        .map(normalize)
        .filter(Boolean)
    ),
  ];
}

function isValidCptCode(code) {
  const normalized = String(code).trim().toUpperCase();
  if (normalized.length !== 5 && normalized.length !== 6) return false;
  return [...normalized.slice(0, -1)].every((ch) => ch >= "0" && ch <= "9");
}

export function normalizeCptLine(line) {
  return {
    code: String(line?.code || "")
      .trim()
      .toUpperCase(),
    modifiers: parseModifierList(line?.modifiers || []),
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
  const codes = parseCodeList(submission?.cpt_code);
  const modifiers = parseModifierList(submission?.cpt_modifiers);
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
