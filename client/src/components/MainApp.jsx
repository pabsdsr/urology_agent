import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { patientService } from "../services/patientService.js";

function MainApp() {
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  const { logout } = useAuth();

  // (Removed unused fetch all patients effect)

  // Server-side typeahead search for patients
  useEffect(() => {
    const fetchSearchedPatients = async () => {
      if (searchTerm.trim().length < 2) {
        setFilteredPatients([]);
        setShowResults(false);
        return;
      }
      try {
        const data = await patientService.searchPatients(searchTerm);
        setFilteredPatients(data);
        setShowResults(true);
      } catch (error) {
        setFilteredPatients([]);
        setShowResults(false);
        console.error("Failed to search patients:", error);
      }
    };
    // Debounce input
    const timeout = setTimeout(fetchSearchedPatients, 250);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

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

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handlePatientSelect = (patient) => {
    setSelectedId(patient.id);
    setSelectedPatient(patient);
    setSearchTerm(`${patient.givenName} ${patient.familyName}`);
    setShowResults(false);
    setMessages([]); // Clear messages when switching patients
  };

  const handlePatientUnselect = () => {
    setSelectedId("");
    setSelectedPatient(null);
    setSearchTerm("");
    setMessages([]); // Clear messages when unselecting
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedId) return;

    const userMessage = {
      id: Date.now(),
      text: inputMessage,
      sender: "user",
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const data = await patientService.runCrew({
        query: inputMessage,
        id: selectedId,
      });

      const botMessage = {
        id: Date.now() + 1,
        text: data.result,
        sender: "bot",
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      
      const errorMessage = {
        id: Date.now() + 1,
        text: error.message || "Sorry, I encountered an error processing your request.",
        sender: "bot",
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }

    setInputMessage("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Logo in top-left corner, aligned with UroAssist */}
      <div className="absolute left-4 z-10">
        <img 
          src="/logo.png" 
          alt="UroAssist Logo" 
          className="w-20 h-20 object-contain"
        />
      </div>
      {/* Header with logout */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-5">
            {/* UroAssist title */}
            <h1 className="text-2xl font-bold text-gray-900">
              UroAssist
            </h1>
            {/* Right side with logout button */}
            <button
              onClick={logout}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Patient Search */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Patient
              </h2>
              <div className="relative" ref={searchRef}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => {
                    if (selectedPatient) {
                      setSearchTerm("");
                      setShowResults(true);
                    }
                  }}
                  placeholder="Search patients..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                
                {showResults && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredPatients.length > 0 ? (
                      filteredPatients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">
                            {patient.givenName} {patient.familyName}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {patient.id}
                            {patient.dob && (
                              <>
                                {" | DOB: "}
                                {patient.dob}
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500">
                        No patients found
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedPatient && (
                <div className="mt-4 p-4 bg-teal-50 rounded-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-teal-900">
                        Selected Patient
                      </h3>
                      <p className="text-teal-700">
                        {selectedPatient.givenName} {selectedPatient.familyName}
                      </p>
                      <p className="text-sm text-teal-600">
                        ID: {selectedPatient.id}
                        {selectedPatient.dob && (
                          <>
                            {" | DOB: "}
                            {selectedPatient.dob}
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={handlePatientUnselect}
                      className="text-gray-400 hover:text-gray-600 focus:outline-none"
                      title="Unselect patient"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow h-[550px] flex flex-col">
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">
                  {selectedPatient 
                    ? `Chat about ${selectedPatient.givenName} ${selectedPatient.familyName}`
                    : "Select a patient to start chatting"
                  }
                </h2>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    {selectedPatient 
                      ? "Ask me anything about this patient's medical information..."
                      : "Please select a patient first"
                    }
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.sender === "user"
                            ? "bg-teal-600 text-white"
                            : "bg-gray-200 text-gray-900"
                        }`}
                      >
                        <p className="text-sm">{message.text}</p>
                        <p
                          className={`text-xs mt-1 ${
                            message.sender === "user"
                              ? "text-teal-200"
                              : "text-gray-500"
                          }`}
                        >
                          {message.timestamp}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-200 text-gray-900 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex space-x-4">
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      selectedPatient
                        ? "Ask about the patient's condition, medications, history..."
                        : "Select a patient first"
                    }
                    disabled={!selectedPatient || loading}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none disabled:bg-gray-100"
                    rows="2"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!selectedPatient || !inputMessage.trim() || loading}
                    className="px-6 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MainApp;
