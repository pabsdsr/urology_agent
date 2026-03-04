import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { scheduleService } from "../services/scheduleService";

function PractitionerSchedule() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    schedule: {},
    practitioner_names: {},
    practitioner_roles: {},
    location_names: {},
    call_schedule: {},
    surgery_appointments: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("day"); // "day" or "week"
  const [activeTab, setActiveTab] = useState("schedule"); // "schedule" or "surgeries"
  const [selectedSurgery, setSelectedSurgery] = useState(null);
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
    // Move back to Sunday of this week
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return { start: formatYMD(sunday), end: formatYMD(saturday) };
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

  const weekRange = viewMode === "week" ? getWorkWeekRange(date) : null;
  const currentDays = weekRange
    ? getDatesInRange(weekRange.start, weekRange.end)
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
          call_schedule: res.call_schedule || {},
          surgery_appointments: res.surgery_appointments || {},
        });
      } catch (err) {
        setError("Failed to load schedule");
      } finally {
        setLoading(false);
      }
    }
    fetchSchedule();
  }, [date, viewMode]);

  const { schedule, practitioner_names, practitioner_roles, location_names, call_schedule, surgery_appointments } = data;
  // Surgery column key from backend (same as server SURGERY_COLUMN_KEY)
  const SURGERY_COLUMN_KEY = "Surgery";
  // Practitioner pods and desired display order within each pod.
  const PODS = [
    {
      name: "North Pod",
      callKey: "North Pod",
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
      name: "Central Pod",
      callKey: "Central Pod",
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
      name: "South Pod",
      callKey: "South Pod",
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

  const NON_SURGERY_PRACTITIONERS = [
    "Olivia Carr",
    "Daniel Cabanero",
    "Taralyn Johnson",
    "Jennifer Kim",
    "Michael Bui",
    "Ashley Swanson",
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
    callKey: pod.callKey || pod.name,
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

  const isSurgeryPractitioner = (id) => {
    const name = practitioner_names[id] || id;
    const nameTokens = new Set(tokenizeName(name));
    for (const target of NON_SURGERY_PRACTITIONERS) {
      const targetTokens = new Set(tokenizeName(target));
      let allMatch = true;
      for (const t of targetTokens) {
        if (!nameTokens.has(t)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch && targetTokens.size > 0) {
        return false;
      }
    }
    return true;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow pt-6 px-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Schedule</h2>
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
        <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Tab:</span>
            <button
              type="button"
              onClick={() => setActiveTab("schedule")}
              className={`px-3 py-1 text-sm rounded border ${
                activeTab === "schedule"
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("surgeries")}
              className={`px-3 py-1 text-sm rounded border ${
                activeTab === "surgeries"
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              Surgery
            </button>
          </div>
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
          {activeTab === "schedule" ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 w-40 text-[15px]">
                    Practitioner
                  </th>
                  {currentDays.map((day) => (
                    <th
                      key={day}
                      className="border-l border-gray-200 px-4 py-3 text-center font-semibold text-gray-900 whitespace-nowrap w-32 text-[15px]"
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
                      <td className="bg-gray-100 px-4 py-3 text-[13.5px] font-semibold uppercase tracking-wide text-gray-800">
                        {pod.name}
                      </td>
                      {currentDays.map((day) => {
                        const key = pod.callKey || pod.name;
                        const entries = (call_schedule?.[day]?.[key]) || [];
                        return (
                          <td
                            key={day}
                            className="bg-gray-100 border-l border-gray-200 px-4 py-3 align-middle w-32 text-gray-700 text-[13px]"
                          >
                            <div className="flex flex-col justify-center items-start space-y-0.5">
                              {entries.length > 0 &&
                                entries.map((entry, idx) => (
                                  <div
                                    key={idx}
                                    className="whitespace-nowrap font-semibold"
                                  >
                                    {entry.location && entry.practitioner
                                      ? `${entry.location}: ${entry.practitioner}`
                                      : entry.location || entry.practitioner || "—"}
                                  </div>
                                ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {pod.practitionerIds.map((practitionerId, rowIndex) => (
                      <tr
                        key={practitionerId}
                        className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900 align-middle whitespace-nowrap border-r border-gray-100">
                          {displayPractitioner(practitionerId)}
                        </td>
                        {currentDays.map((day) => (
                          <td
                            key={day}
                            className="border-l border-gray-200 px-4 py-2.5 align-top w-32 text-gray-700 text-[13px]"
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
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 w-40 text-[15px]">
                    Practitioner
                  </th>
                  {currentDays.map((day) => (
                    <th
                      key={day}
                      className="border-l border-gray-200 px-4 py-3 text-center font-semibold text-gray-900 whitespace-nowrap w-32 text-[15px]"
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
                      <td className="bg-gray-100 px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-gray-800">
                        {pod.name}
                      </td>
                      {currentDays.map((day) => (
                        <td
                          key={day}
                          className="bg-gray-100 border-l border-gray-200 px-4 py-3 align-middle w-32 text-gray-900 text-[14px]"
                        />
                      ))}
                    </tr>
                    {pod.practitionerIds.filter(isSurgeryPractitioner).map((practitionerId, rowIndex) => (
                      <tr
                        key={practitionerId}
                        className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900 align-middle whitespace-nowrap border-r border-gray-100">
                          {displayPractitioner(practitionerId)}
                        </td>
                        {currentDays.map((day) => {
                          const dayData = surgery_appointments?.[day] || {};
                          const surgeriesForPractitioner = dayData[practitionerId] || [];
                          return (
                            <td
                              key={day}
                              className="border-l border-gray-200 px-4 py-2.5 align-top w-32 text-gray-700 text-[13.5px]"
                            >
                              <div className="flex flex-col gap-1.5">
                                {surgeriesForPractitioner.map((sx, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() =>
                                      setSelectedSurgery({
                                        time: sx.time,
                                        locationName: sx.location_name,
                                        procedureType: sx.procedure_type || "Surgery",
                                        patientId: sx.patient_id || "",
                                        practitionerName: displayPractitioner(practitionerId),
                                        date: day,
                                      })
                                    }
                                    className="whitespace-nowrap text-left hover:underline"
                                  >
                                    {`${sx.time} ${sx.location_name}`}
                                  </button>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => navigate("/call-schedule-admin")}
          className="px-3 py-1 text-xs bg-white text-gray-500 rounded-md hover:bg-gray-50 font-medium"
        >
          Edit call schedule
        </button>
      </div>
      </div>
      {selectedSurgery && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Surgery details</h3>
              <button
                type="button"
                onClick={() => setSelectedSurgery(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ×
              </button>
            </div>
            <div className="space-y-1 text-sm text-gray-800">
              <div><span className="font-semibold">Practitioner:</span> {selectedSurgery.practitionerName}</div>
              <div><span className="font-semibold">Date:</span> {selectedSurgery.date}</div>
              <div><span className="font-semibold">Time:</span> {selectedSurgery.time}</div>
              <div><span className="font-semibold">Location:</span> {selectedSurgery.locationName}</div>
              {selectedSurgery.patientId && (
                <div>
                  <span className="font-semibold">Patient:</span>{" "}
                  {selectedSurgery.patientId}
                </div>
              )}
              {selectedSurgery.procedureType && (
                <div><span className="font-semibold">Procedure:</span> {selectedSurgery.procedureType}</div>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSurgery(null)}
                className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PractitionerSchedule;
