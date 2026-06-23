"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COUNTRY_OPTIONS, normalizeCountryIso, type CountryIso } from "@/lib/phone";

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [model, setModel] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [defaultCountryIso, setDefaultCountryIso] = useState<CountryIso>("IN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json())
      .then((settings) => {
        setApiUrl(settings.api_url || "http://localhost:4000");
        setApiKey("");
        setHasApiKey(Boolean(settings.has_api_key));
        setModel(settings.preferred_model || "qwen3.5:9b");
        setAdminPhone(settings.admin_phone || "");
        const defaultCountry = normalizeCountryIso(settings.default_country_iso);
        setDefaultCountryIso(defaultCountry);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          api_url: apiUrl, 
          api_key: apiKey, 
          clear_api_key: clearApiKey,
          preferred_model: model,
          admin_phone: adminPhone,
          default_country_iso: defaultCountryIso,
        }),
      });
      if (res.ok) {
        setMessage("Settings saved successfully!");
        if (clearApiKey) {
          setHasApiKey(false);
          setClearApiKey(false);
        } else if (apiKey.trim()) {
          setHasApiKey(true);
          setApiKey("");
        }
      } else {
        setMessage("Failed to save settings");
      }
    } catch {
      setMessage("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await fetch(`/api/settings/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_url: apiUrl, api_key: apiKey })
      });
      const data = await res.json();
      setTestResult(data.message);
    } catch {
      setTestResult(`❌ Cannot reach API. Make sure LiteLLM proxy is running.`);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="page-container"><div className="loading-center"><span className="loading-spinner lg" /></div></div>;
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure your AI model connection and preferences</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="settings-section">
          <h2>🤖 AI Model Configuration</h2>
          <p>Connect to your LiteLLM proxy or any OpenAI-compatible API endpoint.</p>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">API URL</label>
              <input className="form-input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://localhost:4000" />
            </div>
            <div className="form-group">
              <label className="form-label">API Key (Optional)</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  className="form-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (e.target.value) setClearApiKey(false);
                  }}
                  disabled={clearApiKey}
                  placeholder={hasApiKey && !clearApiKey ? "●●●●●●●● (Stored)" : "sk-... or leave empty"}
                  style={{ flex: "1 1 200px" }}
                />
                {hasApiKey && (
                  <button 
                    type="button" 
                    className={`btn btn-sm ${clearApiKey ? "btn-danger" : "btn-secondary"}`}
                    onClick={() => {
                      setClearApiKey(!clearApiKey);
                      if (!clearApiKey) setApiKey("");
                    }}
                    style={{ flex: "0 0 auto" }}
                  >
                    {clearApiKey ? "Cancel Clear" : "🗑️ Clear Stored Key"}
                  </button>
                )}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                {hasApiKey && !clearApiKey 
                  ? "A key is currently stored. Leave the input blank to keep using it, or enter a new one to replace it."
                  : clearApiKey 
                    ? <span style={{ color: "var(--danger)" }}>⚠️ The stored API key will be deleted upon saving.</span>
                    : "No key is currently stored."}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Model Name</label>
              <input className="form-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3.5:9b" />
            </div>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? (<><span className="loading-spinner" /> Saving...</>) : "💾 Save Settings"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={testConnection} disabled={testing}>
                {testing ? (<><span className="loading-spinner" /> Testing...</>) : "🔌 Test Connection"}
              </button>
            </div>
            {message && <div className={message.includes("success") ? "form-success" : "form-error"}>{message}</div>}
            {testResult && <div className={testResult.startsWith("✅") ? "form-success" : "form-error"} style={{ textAlign: "left" }}>{testResult}</div>}
          </div>
        </div>

        <div className="settings-section">
          <h2>📱 Admin Settings (WhatsApp)</h2>
          <p>Register your main number and set default country handling for all phone inputs.</p>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Default Country</label>
              <select className="form-select" value={defaultCountryIso} onChange={(e) => setDefaultCountryIso(normalizeCountryIso(e.target.value))}>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.iso} value={country.iso}>{country.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Admin Phone Number</label>
              <input 
                className="form-input" 
                value={adminPhone} 
                onChange={(e) => setAdminPhone(e.target.value)} 
                placeholder="e.g. 9876543210 or +919876543210"
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? (<><span className="loading-spinner" /> Saving...</>) : "💾 Save Settings"}
              </button>
            </div>
          </div>
        </div>
      </form>

      <div className="settings-section">
        <h2>ℹ️ Help & About</h2>
        <p style={{ marginBottom: "0.85rem" }}>
          New to HealthForge? The help page walks through profiles, plans, notifications, chat context, and WhatsApp setup.
        </p>
        <Link href="/help" className="btn btn-secondary">Open Help/About</Link>
      </div>
    </div>
  );
}
