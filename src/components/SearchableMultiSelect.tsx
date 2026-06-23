"use client";

import { useMemo, useState } from "react";

interface SearchableMultiSelectOption {
  value: string;
  label: string;
}

interface SearchableMultiSelectProps {
  label?: string;
  options: Array<string | SearchableMultiSelectOption>;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
  helperText?: string;
  maxSuggestions?: number;
}

function normalizeOption(option: string | SearchableMultiSelectOption): SearchableMultiSelectOption {
  return typeof option === "string" ? { value: option, label: option } : option;
}

function uniqueTrimmed(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export default function SearchableMultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search or add...",
  allowCustom = true,
  helperText,
  maxSuggestions = 8,
}: SearchableMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = useMemo(() => options.map(normalizeOption), [options]);
  const selected = useMemo(() => new Set(value), [value]);
  const trimmedQuery = query.trim();

  const suggestions = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    return normalizedOptions
      .filter((option) => !selected.has(option.value))
      .filter((option) => !q || `${option.label} ${option.value}`.toLowerCase().includes(q))
      .slice(0, maxSuggestions);
  }, [maxSuggestions, normalizedOptions, selected, trimmedQuery]);

  const canAddCustom = Boolean(
    allowCustom &&
    trimmedQuery &&
    !selected.has(trimmedQuery) &&
    !normalizedOptions.some((option) => option.value.toLowerCase() === trimmedQuery.toLowerCase())
  );

  const addValue = (next: string) => {
    const clean = next.trim();
    if (!clean || selected.has(clean)) return;
    onChange(uniqueTrimmed([...value, clean]));
    setQuery("");
  };

  const removeValue = (next: string) => {
    onChange(value.filter((item) => item !== next));
  };

  return (
    <div 
      className="searchable-multiselect"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
    >
      {label && <label className="form-label">{label}</label>}
      <div className="searchable-multiselect-box">
        <div className="searchable-multiselect-selected">
          {value.map((item) => {
            const option = normalizedOptions.find((candidate) => candidate.value === item);
            return (
              <span key={item} className="tag-item">
                {option?.label || item}
                <button type="button" onClick={() => removeValue(item)} aria-label={`Remove ${option?.label || item}`}>
                  ×
                </button>
              </span>
            );
          })}
          <input
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (isOpen && suggestions.length > 0) {
                  addValue(suggestions[0].value);
                } else if (isOpen && trimmedQuery && canAddCustom) {
                  addValue(trimmedQuery);
                }
              }
              if (event.key === "Backspace" && !query && value.length > 0) {
                removeValue(value[value.length - 1]);
              }
              if (event.key === "Escape") {
                setIsOpen(false);
              }
            }}
            placeholder={value.length === 0 ? placeholder : "Add more..."}
          />
        </div>
        {isOpen && (suggestions.length > 0 || canAddCustom) && (
          <div 
            className="searchable-multiselect-menu"
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestions.map((option) => (
              <button key={option.value} type="button" onClick={() => addValue(option.value)}>
                <span>{option.label}</span>
                <span className="searchable-multiselect-plus">+</span>
              </button>
            ))}
            {canAddCustom && (
              <button type="button" onClick={() => addValue(trimmedQuery)}>
                <span>Add “{trimmedQuery}”</span>
                <span className="searchable-multiselect-plus">+</span>
              </button>
            )}
          </div>
        )}
      </div>
      {helperText && <div className="searchable-multiselect-helper">{helperText}</div>}
    </div>
  );
}
