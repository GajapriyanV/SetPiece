"use client";

import { useEffect, useRef, useState } from "react";

interface SearchableSelectProps {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  fieldKey: string;
  focused: string;
  onFocus: (key: string) => void;
  onBlur: () => void;
  /** Optional: show "League • Club" style subtitle from a map */
  subtitleMap?: Record<string, string>;
}

export default function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  fieldKey,
  focused,
  onFocus,
  onBlur,
  subtitleMap,
}: SearchableSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync query when value is set externally (e.g. form reset)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If no valid selection, clear
        if (!options.includes(query)) {
          setQuery(value);
        }
        onBlur();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [query, value, options, onBlur]);

  const filtered = query.length === 0
    ? options
    : options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  const isFocused = focused === fieldKey;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    background: "var(--dark2)",
    border: `1px solid ${isFocused ? "var(--g)" : "var(--border2)"}`,
    borderRadius: open ? "2px 2px 0 0" : "2px",
    outline: "none",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "12px",
    color: "var(--text)",
    letterSpacing: "1px",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
    cursor: "text",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "9px",
    color: "var(--dim)",
    letterSpacing: "2px",
    textTransform: "uppercase",
    marginBottom: "6px",
  };

  const handleSelect = (opt: string) => {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
    onBlur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(""); // clear validated value while typing
    setOpen(true);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <label style={labelStyle}>{label}</label>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => {
          onFocus(fieldKey);
          setOpen(true);
        }}
        style={inputStyle}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 200,
            background: "var(--dark2)",
            border: "1px solid var(--g)",
            borderTop: "none",
            borderRadius: "0 0 2px 2px",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {filtered.slice(0, 50).map((opt) => (
            <div
              key={opt}
              onMouseDown={() => handleSelect(opt)}
              style={{
                padding: "9px 14px",
                cursor: "pointer",
                borderBottom: "1px solid var(--border)",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                color: "var(--text)",
                letterSpacing: "0.5px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--dark3)";
                e.currentTarget.style.color = "var(--g)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text)";
              }}
            >
              <span>{opt}</span>
              {subtitleMap?.[opt] && (
                <span style={{
                  fontSize: "9px",
                  color: "var(--dim)",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                }}>
                  {subtitleMap[opt]}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 200,
          background: "var(--dark2)",
          border: "1px solid var(--border2)",
          borderTop: "none",
          borderRadius: "0 0 2px 2px",
          padding: "10px 14px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          color: "var(--dim)",
          letterSpacing: "1px",
        }}>
          No results
        </div>
      )}
    </div>
  );
}
