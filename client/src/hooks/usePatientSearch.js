import { useEffect, useRef, useState } from "react";
import { patientService } from "../services/patientService.js";

/** Debounced ModMed patient typeahead with click-outside dismiss. */
export function usePatientSearch({ minLength = 2, debounceMs = 250 } = {}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const runSearch = async () => {
      if (searchTerm.trim().length < minLength) {
        setResults([]);
        setShowResults(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await patientService.searchPatients(searchTerm);
        if (!cancelled) {
          setResults(data);
          setShowResults(true);
        }
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setShowResults(false);
          console.error("Failed to search patients:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const timeout = setTimeout(runSearch, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [searchTerm, minLength, debounceMs]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    results,
    setResults,
    showResults,
    setShowResults,
    loading,
    searchRef,
  };
}
