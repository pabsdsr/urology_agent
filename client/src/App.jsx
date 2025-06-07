import React, { useEffect, useState } from "react";

export default function App() {
  const [patients, setPatients] = useState([]);
  const [input, setInput] = useState("");
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await fetch("http://localhost:8080/all_patients");
        const data = await res.json();
        setPatients(data);
      } catch (error) {
        console.error("Failed to fetch patients", error);
      }
    };
    fetchPatients();
  }, []);

  const handleSearch = async () => {
    if (!input.trim()) return;
    const [given, family] = input.trim().split(" ");
    if (!given || !family) return alert("Please enter both given and family name");

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/id?family=${family}&given=${given}`);
      const id = await res.json();

      const patientRes = await fetch(`http://localhost:8080/hello?id=${id}`);
      const data = await patientRes.json();

      setPatientData(data);
    } catch (error) {
      console.error("Failed to fetch patient data", error);
      setPatientData({ error: "Failed to fetch patient data." });
    } finally {
      setLoading(false);
    }
  };

  const renderPatientSummary = (data) => {
    if (!data || data.error) {
      return <p>{data?.error || "No data available."}</p>;
    }

    const name = data.name?.[0]?.given?.join(" ") + " " + data.name?.[0]?.family;
    const gender = data.gender;
    const birthDate = data.birthDate;
    const phones = data.telecom?.filter((t) => t.system === "phone").map((t) => `${t.use}: ${t.value}`);
    const email = data.telecom?.find((t) => t.system === "email")?.value;
    const address = data.address?.[0];
    const maritalStatus = data.maritalStatus?.text || "Unknown";

    return (
      <div style={{ backgroundColor: "#f4f4f4", padding: "1rem", borderRadius: "8px", maxHeight: "60vh", overflowY: "auto", color: "#333" }}>
        <h3>Patient Summary</h3>
        <p><strong>Name:</strong> {name}</p>
        <p><strong>Gender:</strong> {gender}</p>
        <p><strong>Birth Date:</strong> {birthDate}</p>
        <p><strong>Marital Status:</strong> {maritalStatus}</p>
        <p><strong>Email:</strong> {email || "N/A"}</p>
        <p><strong>Phone Numbers:</strong></p>
        <ul>
          {phones?.map((p, i) => <li key={i}>{p}</li>) || <li>N/A</li>}
        </ul>
        <p><strong>Address:</strong></p>
        {address ? (
          <div>
            <p>{address.line?.[0]}</p>
            <p>{address.city}, {address.state} {address.postalCode}</p>
          </div>
        ) : <p>N/A</p>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif", backgroundColor: "#333", color: "#f4f4f4" }}>
      <div style={{ width: "30%", padding: "1rem", borderRight: "1px solid #ccc", overflowY: "auto" }}>
        <h2>All Patients</h2>
        <ul>
          {patients.map((p, index) => (
            <li key={index}>{p.givenName} {p.familyName}</li>
          ))}
        </ul>
      </div>

      <div style={{ flex: 1, padding: "2rem" }}>
        <h2>Search Patient</h2>
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Enter given and family name (e.g. Kaylee Lott)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ padding: "0.5rem", width: "60%", marginRight: "1rem" }}
          />
          <button onClick={handleSearch} style={{ padding: "0.5rem 1rem" }}>
            Search
          </button>
        </div>

        {loading ? (
          <p>Loading patient data...</p>
        ) : (
          patientData && renderPatientSummary(patientData)
        )}
      </div>
    </div>
  );
}




