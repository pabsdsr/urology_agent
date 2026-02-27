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

  const addDays = (dateStr, delta) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + delta);
    return formatYMD(d);
  };

  const goToPrev = () => {
    const step = viewMode === "week" ? 7 : 1;
    setDate((prev) => addDays(prev, -step));
  };

  const goToNext = () => {
    const step = viewMode === "week" ? 7 : 1;
    setDate((prev) => addDays(prev, step));
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
  // Practitioner pods and desired display order within each pod.
  const PODS = [
    {
      name: "North pod",
      practitioners: [
        "Don Bui",
        "Leah Nakamura",
        "Paul Oh",
        "Tammy Ho",
        "Ashley Swanson",
        "Michael Bui",
      ],
    },
    {
      name: "Central pod",
      practitioners: [
        "Moses Kim",
        "Daniel Su",
        "Aaron Spitz",
        "Neyssan Tebyani",
        "Daniel Cabanero",
        "Taralyn Johnson",
      ],
    },
    {
      name: "South pod",
      practitioners: [
        "Josh Randall",
        "Poone Shoureshi",
        "Karan Singh",
        "James Meaglia",
        "Olivia Carr",
        "Jennifer Kim",
      ],
    },
  ];

  // Flattened list of all practitioner display names we care about.
  const ALLOWED_PRACTITIONER_NAMES = PODS.flatMap((pod) => pod.practitioners);
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
  const allPractitionerIdsRaw = Object.keys(practitioner_names || {});
  const findPractitionerIdForName = (targetName) => {
    const targetTokens = new Set(tokenizeName(targetName));
    return allPractitionerIdsRaw.find((id) => {
      const name = practitioner_names[id] || id;
      const nameTokens = new Set(tokenizeName(name));
      for (const t of targetTokens) {
        if (!nameTokens.has(t)) return false;
      }
      return true;
    });
  };

  // Resolve practitioner IDs per pod, preserving the specified order.
  const podsWithIds = PODS.map((pod) => ({
    name: pod.name,
    practitionerIds: pod.practitioners
      .map((displayName) => findPractitionerIdForName(displayName))
      .filter(Boolean),
  }));
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
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="text-sm text-gray-600">Date:</span>
            <input
              type="date"
              value={date}
              onChange={e => {
                setDate(e.target.value);
                setViewMode("day");
              }}
              className="border px-2 py-1 rounded"
            />
          </label>
          <button
            type="button"
            onClick={goToPrev}
            className="inline-flex items-center justify-center h-7 w-7 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md border border-gray-300 transition-colors"
            title={viewMode === "week" ? "Previous week" : "Previous day"}
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="inline-flex items-center justify-center h-7 w-7 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md border border-gray-300 transition-colors"
            title={viewMode === "week" ? "Next week" : "Next day"}
          >
            →
          </button>
        </div>
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
            Week
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-teal-600" />
            <span>Loading schedule...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-900 w-40">
                  Practitioner
                </th>
                {currentDays.map((day) => (
                  <th
                    key={day}
                    className="border-l border-gray-200 px-4 py-3 text-center font-semibold text-gray-900 whitespace-nowrap w-32"
                  >
                    {formatColumnDateLabel(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {podsWithIds.map((pod) => (
                <React.Fragment key={pod.name}>
                  <tr>
                    <td
                      colSpan={1 + currentDays.length}
                      className="bg-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-800"
                    >
                      {pod.name}
                    </td>
                  </tr>
                  {pod.practitionerIds.map((practitionerId, rowIndex) => (
                    <tr
                      key={practitionerId}
                      className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-900 align-top whitespace-nowrap border-r border-gray-100">
                        {displayPractitioner(practitionerId)}
                      </td>
                      {currentDays.map((day) => (
                        <td
                          key={day}
                          className="border-l border-gray-200 px-4 py-2.5 align-top w-32 text-gray-700 text-sm"
                        >
                          <div className="flex flex-col gap-1.5">
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
                </React.Fragment>
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
