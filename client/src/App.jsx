import { useEffect, useState, useRef } from "react";
import axios from "axios";

function App() {
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async () => {
    if (!selectedId || !inputMessage.trim()) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      type: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:8080/run_crew", {
        id: selectedId,
        query: inputMessage,
      });
      
      const aiMessage = {
        id: Date.now() + 1,
        type: "ai",
        content: res.data.result || res.data.error || "No response.",
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error("Error during request:", err);
      const errorMessage = {
        id: Date.now() + 1,
        type: "ai",
        content: "An error occurred. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-3">
              🩺 Patient AI Assistant
            </h1>
            <p className="text-gray-300 text-xl">
              Intelligent medical record analysis and patient insights
            </p>
          </div>
          
          {/* Patient Search */}
          <div className="max-w-2xl mx-auto">
            <label className="block text-sm font-medium text-gray-300 mb-3 text-center">
              Select Patient
            </label>
            <div className="relative" ref={searchRef}>
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full px-6 py-4 text-lg border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-gray-700 text-white placeholder-gray-400 transition-colors shadow-sm"
                placeholder="Search patient by name..."
                onFocus={() => {
                  if (filteredPatients.length > 0) {
                    setShowResults(true);
                  }
                }}
              />
              {showResults && filteredPatients.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-600 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredPatients.map((patient) => (
                    <div
                      key={patient.id}
                      onClick={() => handlePatientSelect(patient)}
                      className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-gray-900 text-center">
                        {patient.givenName} {patient.familyName}
                      </div>
                      <div className="text-sm text-gray-500 mt-1 text-center">
                        ID: {patient.id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {selectedPatient && (
              <div className="mt-6 p-4 bg-blue-900/50 border border-blue-600 rounded-xl">
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                  <div className="text-center">
                    <span className="font-medium text-blue-200 text-lg">
                      Selected: {selectedPatient.givenName} {selectedPatient.familyName}
                    </span>
                    <span className="text-sm text-blue-300 ml-2">
                      (ID: {selectedPatient.id})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto py-8">
          <div className="max-w-5xl mx-auto px-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="text-center mb-12 max-w-2xl">
                  <h3 className="text-2xl font-semibold text-gray-100 mb-4">Start a conversation</h3>
                  <p className="text-gray-300 text-lg leading-relaxed">
                    Select a patient above and ask me anything about their medical history, 
                    medications, test results, or treatment plans.
                  </p>
                </div>
                
                {/* Input Area - centered for empty state */}
                <div className="w-full max-w-3xl">
                  <div className="relative">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={selectedPatient ? "Ask me anything about this patient..." : "Select a patient first..."}
                      disabled={!selectedPatient || loading}
                      className="w-full px-6 py-4 pr-16 text-lg border border-gray-600 rounded-2xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none bg-gray-700 text-white placeholder-gray-400 transition-colors shadow-sm disabled:bg-gray-800"
                      rows="1"
                      style={{ minHeight: '60px', maxHeight: '200px' }}
                    />
                    <button
                      onClick={handleSubmit}
                      disabled={!selectedPatient || !inputMessage.trim() || loading}
                      className={`absolute right-3 top-3 p-3 rounded-xl transition-all ${
                        !selectedPatient || !inputMessage.trim() || loading
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                      }`}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-3xl ${
                      message.type === 'user' ? 'ml-12' : 'mr-12'
                    }`}>
                      <div className={`px-6 py-4 rounded-2xl shadow-sm ${
                        message.type === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white border border-gray-200'
                      }`}>
                        <div className="whitespace-pre-wrap text-base leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {loading && (
              <div className="flex justify-start mt-6">
                <div className="mr-12">
                  <div className="bg-gray-700 border border-gray-600 px-6 py-4 rounded-2xl shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <span className="text-sm text-gray-300">AI is thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area - only show when there are messages */}
        {messages.length > 0 && (
          <div className="bg-gray-900 border-t border-gray-700 shadow-sm">
            <div className="max-w-5xl mx-auto px-6 py-6">
              <div className="max-w-3xl mx-auto">
                <div className="relative">
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={selectedPatient ? "Ask me anything about this patient..." : "Select a patient first..."}
                    disabled={!selectedPatient || loading}
                    className="w-full px-6 py-4 pr-16 text-lg border border-gray-600 rounded-2xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none bg-gray-700 text-white placeholder-gray-400 transition-colors shadow-sm disabled:bg-gray-800"
                    rows="1"
                    style={{ minHeight: '60px', maxHeight: '200px' }}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!selectedPatient || !inputMessage.trim() || loading}
                    className={`absolute right-3 top-3 p-3 rounded-xl transition-all ${
                      !selectedPatient || !inputMessage.trim() || loading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

