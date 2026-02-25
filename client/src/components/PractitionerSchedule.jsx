import React, { useEffect, useState } from "react";
import { scheduleService } from "../services/scheduleService";

function PractitionerSchedule() {
  const [data, setData] = useState({ schedule: {}, practitioner_names: {}, practitioner_roles: {}, location_names: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("day"); // "day" or "week"
  // Get current date in US/Pacific time
  function getPacificDateString() {
    // Get the current time in Pacific, regardless of browser timezone
    const now = new Date();
    // Get the equivalent time in Pacific
    const pacificDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    // Compose YYYY-MM-DD
    const year = pacificDateParts.find(p => p.type === 'year').value;
    const month = pacificDateParts.find(p => p.type === 'month').value;
    const day = pacificDateParts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
  }
  const [date, setDate] = useState(getPacificDateString());

  const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getWorkWeekRange = (baseDateStr) => {
    const d = new Date(`${baseDateStr}T00:00:00`);
    const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ...
    const diffToMonday = (dayOfWeek + 6) % 7; // 0 when Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() - diffToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return { start: formatYMD(monday), end: formatYMD(friday) };
  };

  const getDatesInRange = (startStr, endStr) => {
    const dates = [];
    let cur = new Date(`${startStr}T00:00:00`);
    const end = new Date(`${endStr}T00:00:00`);
    while (cur <= end) {
      dates.push(formatYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  const currentDays = viewMode === "week"
    ? getDatesInRange(getWorkWeekRange(date).start, getWorkWeekRange(date).end)
    : [date];

  const formatColumnDateLabel = (dayStr) => {
    if (!dayStr) return "";
    const parts = dayStr.split("-");
    if (parts.length !== 3) return dayStr;
    const [, month, day] = parts;
    return `${month}/${day}`;
  };

  useEffect(() => {
    async function fetchSchedule() {
      setLoading(true);
      setError(null);
      try {
        let start = date;
        let end = date;
        if (viewMode === "week") {
          const range = getWorkWeekRange(date);
          start = range.start;
          end = range.end;
        }
        const res = await scheduleService.getPractitionerSchedule(start, end);
        setData({
          schedule: res.schedule || {},
          practitioner_names: res.practitioner_names || {},
          practitioner_roles: res.practitioner_roles || {},
          location_names: res.location_names || {},
        });
      } catch (err) {
        setError("Failed to load schedule");
      } finally {
        setLoading(false);
      }
    }
    fetchSchedule();
  }, [date, viewMode]);

  const { schedule, practitioner_names, practitioner_roles, location_names } = data;
  // Surgery column key from backend (same as server SURGERY_COLUMN_KEY)
  const SURGERY_COLUMN_KEY = "Surgery";
  // Only show selected practitioners on the schedule (match by practitioner name).
  // Order is hard-coded: all MDs (alphabetical), then PAs (alphabetical), then NPs (alphabetical).
  // Matching is done by token inclusion (ignoring credentials like MD/PA/NP and commas),
  // so names with extra middle initials or suffixes still match.
  const ALLOWED_PRACTITIONER_NAMES = [
    // Physicians (MDs)
    "Aaron Spitz",
    "Daniel Su",
    "Don Bui",
    "James Meaglia",
    "Josh Randall",
    "Karan Singh",
    "Leah Nakamura",
    "Moses Kim",
    "Neyssan Tebyani",
    "Paul Oh",
    "Poone Shoureshi",
    "Tammy Ho",
    // Physician Assistants (PAs)
    "Daniel Cabanero",
    "Jennifer Kim",
    "Olivia Carr",
    "Taralyn Johnson",
    // Nurse Practitioners (NPs)
    "Ashley Swanson",
    "Michael Bui",
  ];
  const tokenizeName = (name) => {
    if (!name) return [];
    const credentialTokens = new Set(["md", "m.d.", "pa", "p.a.", "np", "n.p."]);
    return name
      .toLowerCase()
      .replace(/[,]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !credentialTokens.has(t));
  };
  const ALLOWED_PRACTITIONER_NAME_TOKENS = ALLOWED_PRACTITIONER_NAMES.map((n) => ({
    tokens: new Set(tokenizeName(n)),
  }));
  // Start from all known practitioners (so they show even with no schedule),
  // then project them into the exact hard-coded order above.
  const allPractitionerIdsRaw = Object.keys(practitioner_names || {});
  const orderedPractitionerIds = [];
  for (const { tokens } of ALLOWED_PRACTITIONER_NAME_TOKENS) {
    const matchId = allPractitionerIdsRaw.find((id) => {
      const name = practitioner_names[id] || id;
      const nameTokens = new Set(tokenizeName(name));
      for (const t of tokens) {
        if (!nameTokens.has(t)) return false;
      }
      return true;
    });
    if (matchId && !orderedPractitionerIds.includes(matchId)) {
      orderedPractitionerIds.push(matchId);
    }
  }
  const formatLocationLabel = (label) => {
    if (!label) return "";
    const lower = label.toLowerCase();
    if (lower === "telehealth") return "TH";
    if (lower === "surgery") return "SX";
    if (lower === "irvine") return "IRV";
    return label;
  };
  const isTelehealthLocation = (locId) => {
    const raw =
      locId === SURGERY_COLUMN_KEY
        ? SURGERY_COLUMN_KEY
        : (location_names[locId] || locId);
    return raw && raw.toLowerCase() === "telehealth";
  };
  const getBlockLocationsLabel = (day, practitionerId, block) => {
    const locEntries = Object.keys(schedule[day]?.[practitionerId]?.[block] || {});
    if (locEntries.length === 0) return "";
    // If there is at least one non-Telehealth location in this block,
    // hide Telehealth for that half-day (keep it only when Telehealth is the sole location).
    const nonTelehealthLocs = locEntries.filter((id) => !isTelehealthLocation(id));
    const locIdsToShow = (nonTelehealthLocs.length > 0 ? nonTelehealthLocs : locEntries).slice(0, 1);
    const labels = locIdsToShow.map((locId) => {
      const rawTime = schedule[day]?.[practitionerId]?.[block]?.[locId] || "";
      const timePart = rawTime ? `${rawTime}` : "";
      const label =
        locId === SURGERY_COLUMN_KEY
          ? formatLocationLabel(SURGERY_COLUMN_KEY)
          : formatLocationLabel(location_names[locId] || locId);
      return timePart ? `${timePart} ${label}` : label;
    });
    return labels.join(", ");
  };
  const getBlockDisplay = (day, practitionerId, block) => {
    const locLabel = getBlockLocationsLabel(day, practitionerId, block);
    if (!locLabel) return `${block}: OUT`;
    return `${block}: ${locLabel}`;
  };
  // Practitioner display: "Name" or "Name (Role)" when role is present (e.g. MD, RN, PA)
  const displayPractitioner = (id) => {
    const name = practitioner_names[id] || id;
    const role = practitioner_roles[id];
    return role ? `${name} (${role})` : name;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Schedule</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 mb-4">
        <label>
          Date:
          <input
            type="date"
            value={date}
            onChange={e => {
              setDate(e.target.value);
              // When changing the date, default back to day view
              setViewMode("day");
            }}
            className="ml-2 border px-2 py-1 rounded"
          />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">View:</span>
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`px-3 py-1 text-sm rounded border ${
              viewMode === "day"
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-700 border-gray-300"
            }`}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`px-3 py-1 text-sm rounded border ${
              viewMode === "week"
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-700 border-gray-300"
            }`}
          >
            Work week
          </button>
        </div>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead>
              <tr>
                <th className="border px-2 py-1 w-40">Practitioner</th>
                {currentDays.map((day) => (
                  <th
                    key={day}
                    className="border px-2 py-1 whitespace-nowrap w-32"
                  >
                    {formatColumnDateLabel(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedPractitionerIds.map((practitionerId) => (
                <tr key={practitionerId}>
                  <td className="border px-2 py-1 align-top whitespace-nowrap w-40">
                    {displayPractitioner(practitionerId)}
                  </td>
                  {currentDays.map((day) => (
                    <td
                      key={day}
                      className="border px-2 py-1 align-top w-32"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="whitespace-nowrap">
                          {getBlockDisplay(day, practitionerId, "AM")}
                        </div>
                        <div className="whitespace-nowrap">
                          {getBlockDisplay(day, practitionerId, "PM")}
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

export default PractitionerSchedule;
