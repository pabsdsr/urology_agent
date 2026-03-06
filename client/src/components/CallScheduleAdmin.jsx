import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { callScheduleService } from "../services/callScheduleService";

function formatYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = d.getDay();
  d.setDate(d.getDate() - dayOfWeek);
  return formatYMD(d);
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return formatYMD(d);
}

export default function CallScheduleAdmin() {
  const today = useMemo(() => {
    const now = new Date();
    return formatYMD(now);
  }, []);

  const [customLocations, setCustomLocations] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("callScheduleCustomLocations");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [customPractitioners, setCustomPractitioners] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("callScheduleCustomPractitioners");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [openLocationPicker, setOpenLocationPicker] = useState(null); // { rowIdx, podKey } | null
  const [openPractitionerPicker, setOpenPractitionerPicker] = useState(null); // { rowIdx, podKey } | null
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadStatusError, setUploadStatusError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!containerRef.current) {
        setOpenLocationPicker(null);
        setOpenPractitionerPicker(null);
        return;
      }
      const dropdownRoots = document.querySelectorAll(
        '[data-dropdown-root="true"]'
      );
      let insideDropdown = false;
      dropdownRoots.forEach((el) => {
        if (el.contains(event.target)) {
          insideDropdown = true;
        }
      });
      if (!insideDropdown) {
        setOpenLocationPicker(null);
        setOpenPractitionerPicker(null);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  const DropdownPortal = ({ open, anchorEl, children }) => {
    const [style, setStyle] = useState(null);

    useLayoutEffect(() => {
      if (!open || !anchorEl) return;

      const update = () => {
        const rect = anchorEl.getBoundingClientRect();
        const MENU_MAX_HEIGHT_PX = 192; // Tailwind max-h-48
        const GAP_PX = 4;
        const availableBelow = Math.max(80, window.innerHeight - rect.bottom - GAP_PX - 8);
        const maxHeight = Math.min(MENU_MAX_HEIGHT_PX, availableBelow);

        const nextStyle = {
          position: "fixed",
          top: rect.bottom + GAP_PX,
          left: rect.left,
          width: rect.width,
          maxHeight,
          overflow: "auto",
        };

        setStyle(nextStyle);
      };

      update();
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      return () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
      };
    }, [open, anchorEl]);

    if (!open || !anchorEl || !style) return null;

    return createPortal(
      <div data-dropdown-root="true" style={style} className="z-[99999]">
        {children}
      </div>,
      document.body
    );
  };

  const handleWeekStartChange = (val) => {
    if (!val) return;
    const start = startOfWeek(val);
    setWeekStart(start);
  };

  // Load existing schedule for the selected week and populate rows.
  useEffect(() => {
    if (!weekStart) return;

    const weekEnd = addDays(weekStart, 6);

    const buildEmptyRows = () => {
      const base = new Date(`${weekStart}T00:00:00`);
      return Array.from({ length: 7 }, (_, idx) => {
        const day = new Date(base);
        day.setDate(base.getDate() + idx);
        const dateStr = formatYMD(day);
        return {
          date: dateStr,
          north: [{ location: "", practitioner: "" }],
          central: [{ location: "", practitioner: "" }],
          south: [{ location: "", practitioner: "" }],
        };
      });
    };

    let isCancelled = false;

    (async () => {
      try {
        const serverData =
          (await callScheduleService.getCallSchedule(weekStart, weekEnd)) || {};
        if (isCancelled) return;

        const nextRows = buildEmptyRows().map((row) => {
          const dayData = serverData[row.date] || {};
          const normalize = (entries) => {
            if (!Array.isArray(entries) || entries.length === 0) {
              return [{ location: "", practitioner: "" }];
            }
            return entries.map((e) => ({
              location: e.location || "",
              practitioner: e.practitioner || "",
            }));
          };
          const getPodEntries = (data, label) =>
            data[label] ||
            data[label.toLowerCase()] ||
            data[label.replace(" Pod", " pod")] ||
            [];
          return {
            date: row.date,
            north: normalize(getPodEntries(dayData, "North Pod")),
            central: normalize(getPodEntries(dayData, "Central Pod")),
            south: normalize(getPodEntries(dayData, "South Pod")),
          };
        });

        setRows(nextRows);
      } catch {
        // On error, just show empty week
        if (!isCancelled) {
          setRows(buildEmptyRows());
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [weekStart, reloadKey]);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadStatus(null);
    setUploadStatusError(false);
    try {
      const result = await callScheduleService.uploadSchedule(file);
      const count = result?.updated_keys?.length ?? 0;
      const label =
        count > 0
          ? `Call schedule successfully saved (${count} day${count === 1 ? "" : "s"} updated)`
          : "Call schedule successfully saved";
      setUploadStatus(label);
      setMessage(label);
      setReloadKey((k) => k + 1);
    } catch (err) {
      const detail =
        err?.response?.data?.detail || err?.message || "Failed to upload schedule";
      setUploadStatus(detail);
      setUploadStatusError(true);
    } finally {
      setUploading(false);
    }
  };

  const handleEntryChange = (rowIdx, podKey, entryIdx, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const entries = Array.isArray(row[podKey]) ? [...row[podKey]] : [];
        const existing = entries[entryIdx] || { location: "", practitioner: "" };
        entries[entryIdx] = { ...existing, [field]: value };
        return { ...row, [podKey]: entries };
      })
    );
  };

  const addEntry = (rowIdx, podKey) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const entries = Array.isArray(row[podKey]) ? [...row[podKey]] : [];
        entries.push({ location: "", practitioner: "" });
        return { ...row, [podKey]: entries };
      })
    );
  };

  const removeEntry = (rowIdx, podKey, entryIdx) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const entries = Array.isArray(row[podKey]) ? [...row[podKey]] : [];
        if (entries.length <= 1) {
          // Keep one empty row instead of removing the last one
          return { ...row, [podKey]: [{ location: "", practitioner: "" }] };
        }
        entries.splice(entryIdx, 1);
        return { ...row, [podKey]: entries };
      })
    );
  };

  const allLocationOptions = useMemo(() => {
    const unique = [...new Set(customLocations)];
    return unique.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [customLocations]);

  const allPractitionerOptions = useMemo(() => {
    const unique = [...new Set(customPractitioners)];
    return unique.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [customPractitioners]);

  const renderPodCell = (row, rowIdx, podKey) => {
    return (
      <td className="px-4 py-2.5 align-top text-[13px]">
        <div className="space-y-1.5">
          {(row[podKey] || []).map((entry, entryIdx) => (
            <div
              key={entryIdx}
              className="flex items-center gap-2"
              data-dropdown-root="true"
            >
              <div className="relative flex-1 min-w-[140px] max-w-[180px]">
                <input
                  type="text"
                  className="border rounded px-2 py-1 text-[13px] w-full"
                  placeholder="Location"
                  value={entry.location}
                  onChange={(e) =>
                    handleEntryChange(
                      rowIdx,
                      podKey,
                      entryIdx,
                      "location",
                      e.target.value
                    )
                  }
                  onFocus={(e) => {
                    setOpenLocationPicker({
                      rowIdx,
                      podKey,
                      entryIdx,
                      anchorEl: e.currentTarget,
                    });
                    setOpenPractitionerPicker(null);
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-1 text-gray-400 hover:text-gray-600 text-xs"
                  onClick={(e) =>
                    setOpenLocationPicker((prev) => {
                      const isSame =
                        prev &&
                        prev.rowIdx === rowIdx &&
                        prev.podKey === podKey &&
                        prev.entryIdx === entryIdx;
                      if (isSame) {
                        return null;
                      }
                      setOpenPractitionerPicker(null);
                      const inputEl =
                        e.currentTarget?.parentElement?.querySelector("input") ||
                        null;
                      return { rowIdx, podKey, entryIdx, anchorEl: inputEl };
                    })
                  }
                  tabIndex={-1}
                >
                  ▾
                </button>
              </div>
              <div className="relative flex-1 min-w-[140px] max-w-[180px]">
                <input
                  type="text"
                  className="border rounded px-2 py-1 text-[13px] w-full"
                  placeholder="Practitioner"
                  value={entry.practitioner}
                  onChange={(e) =>
                    handleEntryChange(
                      rowIdx,
                      podKey,
                      entryIdx,
                      "practitioner",
                      e.target.value
                    )
                  }
                  onFocus={(e) => {
                    setOpenPractitionerPicker({
                      rowIdx,
                      podKey,
                      entryIdx,
                      anchorEl: e.currentTarget,
                    });
                    setOpenLocationPicker(null);
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-1 text-gray-400 hover:text-gray-600 text-xs"
                  onClick={(e) =>
                    setOpenPractitionerPicker((prev) => {
                      const isSame =
                        prev &&
                        prev.rowIdx === rowIdx &&
                        prev.podKey === podKey &&
                        prev.entryIdx === entryIdx;
                      if (isSame) {
                        return null;
                      }
                      setOpenLocationPicker(null);
                      const inputEl =
                        e.currentTarget?.parentElement?.querySelector("input") ||
                        null;
                      return { rowIdx, podKey, entryIdx, anchorEl: inputEl };
                    })
                  }
                  tabIndex={-1}
                >
                  ▾
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(rowIdx, podKey, entryIdx)}
                className="text-xs text-gray-400 hover:text-red-500 px-1"
                aria-label="Remove entry"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addEntry(rowIdx, podKey)}
            className="text-xs text-teal-700 hover:text-teal-900"
          >
            + Add entry
          </button>
        </div>
      </td>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await callScheduleService.saveWeek(weekStart, rows);
      setMessage("Call schedule successfully saved");
    } catch (err) {
      setMessage(err?.message || "Failed to save call schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleClearWeek = async () => {
    if (!weekStart || rows.length === 0) return;
    setSaving(true);
    setMessage("");
    try {
      const emptyRows = rows.map((row) => ({
        date: row.date,
        north: [],
        central: [],
        south: [],
      }));
      await callScheduleService.saveWeek(weekStart, emptyRows);
      setRows(emptyRows.map((r) => ({ ...r, north: [{ location: "", practitioner: "" }], central: [{ location: "", practitioner: "" }], south: [{ location: "", practitioner: "" }] })));
      setMessage("Call schedule cleared for this week");
    } catch (err) {
      setMessage(err?.message || "Failed to clear call schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFromPreviousWeek = async () => {
    if (!weekStart) return;
    setSaving(true);
    setMessage("");
    try {
      const prevWeekStart = addDays(weekStart, -7);
      const prevWeekEnd = addDays(prevWeekStart, 6);
      const prevData =
        (await callScheduleService.getCallSchedule(prevWeekStart, prevWeekEnd)) ||
        {};

      const baseCurrent = new Date(`${weekStart}T00:00:00`);
      const basePrev = new Date(`${prevWeekStart}T00:00:00`);

      const normalize = (entries) => {
        if (!Array.isArray(entries) || entries.length === 0) {
          return [{ location: "", practitioner: "" }];
        }
        return entries.map((e) => ({
          location: e.location || "",
          practitioner: e.practitioner || "",
        }));
      };

      const getPodEntries = (data, label) =>
        data[label] ||
        data[label.toLowerCase()] ||
        data[label.replace(" Pod", " pod")] ||
        [];

      const nextRows = Array.from({ length: 7 }, (_, idx) => {
        const curDay = new Date(baseCurrent);
        curDay.setDate(baseCurrent.getDate() + idx);
        const curDateStr = formatYMD(curDay);

        const prevDay = new Date(basePrev);
        prevDay.setDate(basePrev.getDate() + idx);
        const prevDateStr = formatYMD(prevDay);

        const dayData = prevData[prevDateStr] || {};

        return {
          date: curDateStr,
          north: normalize(getPodEntries(dayData, "North Pod")),
          central: normalize(getPodEntries(dayData, "Central Pod")),
          south: normalize(getPodEntries(dayData, "South Pod")),
        };
      });

      setRows(nextRows);
      await callScheduleService.saveWeek(weekStart, nextRows);
      setMessage("Call schedule copied from previous week");
    } catch (err) {
      setMessage(err?.message || "Failed to copy from previous week");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-visible"
    >
      <div className="relative bg-white rounded-lg shadow p-6 overflow-visible">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Call Schedule (Admin)</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                <span className="text-sm text-gray-700">Week starting:</span>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => handleWeekStartChange(e.target.value)}
                  className="border px-2 py-1 rounded"
                />
              </label>
              <button
                type="button"
                onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                className="inline-flex items-center justify-center h-7 w-7 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md border border-gray-300 transition-colors"
                title="Previous week"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                className="inline-flex items-center justify-center h-7 w-7 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md border border-gray-300 transition-colors"
                title="Next week"
              >
                →
              </button>
            </div>
            <span className="text-xs text-gray-500">
              (Will align to Sunday of that week)
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Upload (CSV/XLSX):</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center justify-center h-7 px-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md border border-gray-300 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                >
                  Choose file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {uploading && (
                <span className="text-xs text-gray-500">Importing…</span>
              )}
              {!uploading && uploadStatus && (
                <span
                  className={`text-xs ${
                    uploadStatusError ? "text-red-600" : "text-teal-600"
                  }`}
                >
                  {uploadStatus}
                </span>
              )}
            </div>
          </div>

          <div className="relative z-10 overflow-visible rounded-lg border border-gray-200">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100">
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 text-[15px]">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 text-[15px]">
                    North Pod
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 text-[15px]">
                    Central Pod
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 text-[15px]">
                    South Pod
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {rows.map((row, idx) => (
                  <tr
                    key={row.date}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-800 text-sm font-medium">
                      {row.date}
                    </td>
                    {renderPodCell(row, idx, "north")}
                    {renderPodCell(row, idx, "central")}
                    {renderPodCell(row, idx, "south")}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DropdownPortal
            open={!!openLocationPicker}
            anchorEl={openLocationPicker?.anchorEl}
          >
            <div className="rounded-md border border-gray-200 bg-white shadow-lg text-xs">
              {allLocationOptions.map((opt) => {
                return (
                  <button
                    key={opt}
                    type="button"
                    className="block w-full text-left px-2 py-1 hover:bg-gray-100"
                    onClick={() => {
                      if (!openLocationPicker) return;
                      handleEntryChange(
                        openLocationPicker.rowIdx,
                        openLocationPicker.podKey,
                        openLocationPicker.entryIdx,
                        "location",
                        opt
                      );
                      setOpenLocationPicker(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{opt}</span>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-500 text-[10px] px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomLocations((prev) => {
                            const next = prev.filter((x) => x !== opt);
                            if (typeof window !== "undefined") {
                              window.localStorage.setItem(
                                "callScheduleCustomLocations",
                                JSON.stringify(next)
                              );
                            }
                            return next;
                          });
                        }}
                        aria-label={`Delete ${opt} from locations`}
                      >
                        ×
                      </button>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                className="block w-full text-left px-2 py-1 border-t border-gray-200 text-teal-700 hover:bg-gray-50"
                onClick={() => {
                  if (!openLocationPicker) return;
                  const value = (
                    rows?.[openLocationPicker.rowIdx]?.[
                      openLocationPicker.podKey
                    ]?.[openLocationPicker.entryIdx]?.location || ""
                  ).trim();
                  if (!value) return;
                  setCustomLocations((prev) => {
                    const next = Array.from(new Set([...prev, value]));
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(
                        "callScheduleCustomLocations",
                        JSON.stringify(next)
                      );
                    }
                    return next;
                  });
                  setOpenLocationPicker(null);
                }}
              >
                + Add “
                {(
                  rows?.[openLocationPicker?.rowIdx]?.[
                    openLocationPicker?.podKey
                  ]?.[openLocationPicker?.entryIdx]?.location || ""
                ).trim() || " "}
                ” as location
              </button>
            </div>
          </DropdownPortal>

          <DropdownPortal
            open={!!openPractitionerPicker}
            anchorEl={openPractitionerPicker?.anchorEl}
          >
            <div className="rounded-md border border-gray-200 bg-white shadow-lg text-xs">
              {allPractitionerOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100"
                  onClick={() => {
                    if (!openPractitionerPicker) return;
                    handleEntryChange(
                      openPractitionerPicker.rowIdx,
                      openPractitionerPicker.podKey,
                      openPractitionerPicker.entryIdx,
                      "practitioner",
                      opt
                    );
                    setOpenPractitionerPicker(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{opt}</span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-500 text-[10px] px-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomPractitioners((prev) => {
                          const next = prev.filter((x) => x !== opt);
                          if (typeof window !== "undefined") {
                            window.localStorage.setItem(
                              "callScheduleCustomPractitioners",
                              JSON.stringify(next)
                            );
                          }
                          return next;
                        });
                      }}
                      aria-label={`Delete ${opt} from practitioners`}
                    >
                      ×
                    </button>
                  </div>
                </button>
              ))}
              <button
                type="button"
                className="block w-full text-left px-2 py-1 border-t border-gray-200 text-teal-700 hover:bg-gray-50"
                onClick={() => {
                  if (!openPractitionerPicker) return;
                  const value = (
                    rows?.[openPractitionerPicker.rowIdx]?.[
                      openPractitionerPicker.podKey
                    ]?.[openPractitionerPicker.entryIdx]?.practitioner || ""
                  ).trim();
                  if (!value) return;
                  setCustomPractitioners((prev) => {
                    const next = Array.from(new Set([...prev, value]));
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(
                        "callScheduleCustomPractitioners",
                        JSON.stringify(next)
                      );
                    }
                    return next;
                  });
                  setOpenPractitionerPicker(null);
                }}
              >
                + Add “
                {(
                  rows?.[openPractitionerPicker?.rowIdx]?.[
                    openPractitionerPicker?.podKey
                  ]?.[openPractitionerPicker?.entryIdx]?.practitioner || ""
                ).trim() || " "}
                ” as practitioner
              </button>
            </div>
          </DropdownPortal>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                {saving ? "Saving..." : "Save week"}
              </button>
              <button
                type="button"
                onClick={handleCopyFromPreviousWeek}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:bg-gray-200 disabled:cursor-not-allowed"
              >
                Copy from previous week
              </button>
              <button
                type="button"
                onClick={handleClearWeek}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:bg-gray-200 disabled:cursor-not-allowed"
              >
                Clear week
              </button>
            </div>
            {message && (
              <span className="text-sm text-gray-700">{message}</span>
            )}
          </div>
        </form>
      </div>

    </div>
  );
}

