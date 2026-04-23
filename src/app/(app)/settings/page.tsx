"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json())
      .then((settings) => {
        setApiUrl(settings.api_url || "http://localhost:4000");
        setApiKey(settings.api_key || "");
        setModel(settings.preferred_model || "qwen3.5:9b");
        setAdminPhone(settings.admin_phone || "");
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
          preferred_model: model,
          admin_phone: adminPhone
        }),
      });
      setMessage(res.ok ? "Settings saved successfully!" : "Failed to save settings");
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
      const res = await fetch(`${apiUrl}/v1/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const modelCount = data.data?.length || 0;
        const modelNames = data.data?.slice(0, 5).map((m: { id?: string }) => m.id).join(", ") || "none";
        setTestResult(`✅ Connected! Found ${modelCount} models: ${modelNames}${modelCount > 5 ? "..." : ""}`);
      } else {
        setTestResult(`❌ Connection failed: ${res.status} ${res.statusText}`);
      }
    } catch {
      setTestResult(`❌ Cannot reach ${apiUrl}. Make sure LiteLLM proxy is running.`);
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
              <input className="form-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-... or leave empty" />
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
          <p>Register your main number. You can choose to be CC'd on messages sent to profiles or groups.</p>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Admin Phone Number</label>
              <input 
                className="form-input" 
                value={adminPhone} 
                onChange={(e) => setAdminPhone(e.target.value)} 
                placeholder="e.g. 919876543210 (include country code)" 
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
        <h2>ℹ️ About HealthForge</h2>
        <p style={{ marginBottom: "0.5rem" }}>
          HealthForge is an AI-powered health and lifestyle recommendation platform.
          It uses your local LiteLLM proxy to generate personalized, evidence-based
          health plans for you, your family, and friends.
        </p>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: "1.8" }}>
          <strong>Version:</strong> 2.0.0<br />
          <strong>Stack:</strong> Next.js 15 · SQLite · LiteLLM · Baileys<br />
          <strong>Data:</strong> All data is stored locally on your machine
        </div>
      </div>
    </div>
  );
}
