// client/src/App.jsx
import React, { useState } from "react";

export default function App() {
  const [messages, setMessages] = useState([
    { sender: "agent", text: "Hello! How can I help you with ModMed today?" }
  ]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;

    // user message
    const newMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");

    try {
      const res = await fetch("http://localhost:8080/hello");
      const data = await res.json();

      //try to extract a simple summary
      const patientName =
        data?.name?.[0]?.given?.join(" ") + " " + data?.name?.[0]?.family;
      const birthDate = data?.birthDate;
      const responseText = patientName
        ? `Patient Name: ${patientName}\nDOB: ${birthDate}`
        : "Patient data retrieved, but no name found.";

      setMessages((prev) => [...prev, { sender: "agent", text: responseText }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { sender: "agent", text: "⚠️ Failed to fetch patient data." }
      ]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white text-2xl p-4 font-bold shadow">
        ModMed Agent
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-xl ${
              msg.sender === "agent"
                ? "bg-white self-start"
                : "bg-blue-500 text-white self-end"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </main>

      <footer className="p-4 bg-white flex gap-2 border-t">
        <input
          className="flex-1 border rounded-lg px-3 py-2 shadow-sm"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          onClick={handleSend}
        >
          Send
        </button>
      </footer>
    </div>
  );
}



