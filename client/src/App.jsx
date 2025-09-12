import { useEffect, useState, useRef } from "react";
import axios from "axios";

function App() {
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  // ✅ Correct API route: localhost:8080
  useEffect(() => {
    axios
      .get("http://localhost:8080/all_patients")
      .then((res) => {
        console.log("Fetched patients:", res.data);
        setPatients(res.data);
      })
      .catch((err) => console.error("Failed to fetch patients:", err));
  }, []);

  // Filter patients based on search term
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredPatients([]);
      setShowResults(false);
      return;
    }

    const filtered = patients.filter((patient) => {
      const fullName = `${patient.givenName} ${patient.familyName}`.toLowerCase();
      return fullName.includes(searchTerm.toLowerCase());
    });

    setFilteredPatients(filtered);
    setShowResults(true);
  }, [searchTerm, patients]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePatientSelect = (patient) => {
    setSelectedId(patient.id);
    setSelectedPatient(patient);
    setSearchTerm(`${patient.givenName} ${patient.familyName}`);
    setShowResults(false);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    if (e.target.value === "") {
      setSelectedId("");
      setSelectedPatient(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedId || !query) {
      setResponse("Please select a patient and enter a query.");
      return;
    }

    setLoading(true);
    setResponse("");

    try {
      const res = await axios.post("http://localhost:8080/run_crew", {
        id: selectedId,
        query,
      });
      setResponse(res.data.result || res.data.error || "No response.");
    } catch (err) {
      console.error("Error during request:", err);
      setResponse("An error occurred. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white p-6 rounded-lg shadow space-y-5">
          <h1 className="text-2xl font-bold text-center">
            🩺 Patient AI Assistant
          </h1>

          {/* Search */}
          <div className="relative" ref={searchRef}>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Search Patient
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                placeholder="Type patient name to search..."
                onFocus={() => {
                  if (filteredPatients.length > 0) {
                    setShowResults(true);
                  }
                }}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {showResults && filteredPatients.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                {filteredPatients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => handlePatientSelect(patient)}
                    className="p-4 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors duration-150"
                  >
                    <div className="font-semibold text-gray-900">
                      {patient.givenName} {patient.familyName}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Patient ID: {patient.id}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showResults &&
              searchTerm.trim() !== "" &&
              filteredPatients.length === 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 text-gray-500 text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span>No patients found matching "{searchTerm}"</span>
                  </div>
                </div>
              )}

            {selectedPatient && (
              <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center space-x-2">
                  <svg
                    className="h-5 w-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <div>
                    <span className="text-green-800 font-semibold">
                      Patient Selected:{" "}
                    </span>
                    <span className="text-green-700 font-medium">
                      {selectedPatient.givenName} {selectedPatient.familyName}
                    </span>
                    <span className="text-green-600 text-sm ml-2">
                      (ID: {selectedPatient.id})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Query */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Enter Query
            </label>
            <div className="relative">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white resize-none"
                placeholder="e.g. Summarize patient history, analyze symptoms, provide treatment recommendations..."
                rows="3"
              />
              <div className="absolute bottom-3 right-3 text-xs text-gray-400">
                {query.length}/500
              </div>
            </div>
          </div>

          {/* Button */}
          <button
            onClick={handleSubmit}
            disabled={!selectedId || !query || loading}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 transform ${
              !selectedId || !query || loading
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Processing...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Run AI Analysis</span>
              </div>
            )}
          </button>

          {/* Response */}
          {response && (
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 border border-gray-200 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <h2 className="text-lg font-semibold text-gray-800">
                  AI Response
                </h2>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {response}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setResponse("")}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200"
                >
                  Clear Response
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
