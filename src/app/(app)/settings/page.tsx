"use client";

import { useEffect, useState } from "react";

interface Schedule {
  id: string;
  phone_number: string;
  schedule_type: string;
  message_template: string;
  is_active: number;
}

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  // WhatsApp User Opt-in State
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [waPhone, setWaPhone] = useState("");
  const [waTime, setWaTime] = useState("daily_morning");
  const [waOptInLoading, setWaOptInLoading] = useState(false);
  const [waMessage, setWaMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/whatsapp/schedules").then((r) => r.json()).catch(() => []),
    ]).then(([settings, scheds]) => {
      setApiUrl(settings.api_url || "http://localhost:4000");
      setApiKey(settings.api_key || "");
      setModel(settings.preferred_model || "qwen3.5:9b");
      
      const parsedScheds = Array.isArray(scheds) ? scheds : [];
      setSchedules(parsedScheds);
      
      // Pre-fill if user has a schedule
      if (parsedScheds.length > 0) {
        setWaPhone(parsedScheds[0].phone_number);
        setWaTime(parsedScheds[0].schedule_type);
      }
      
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
        body: JSON.stringify({ api_url: apiUrl, api_key: apiKey, preferred_model: model }),
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

  async function handleWaOptIn(e: React.FormEvent) {
    e.preventDefault();
    if (!waPhone.trim()) return;
    
    setWaOptInLoading(true);
    setWaMessage("");
    
    try {
      // For simplicity in this UI, if they have an existing schedule, we update or replace it.
      // Easiest way: delete all existing, create a new one.
      for (const s of schedules) {
        await fetch(`/api/whatsapp/schedules/${s.id}`, { method: "DELETE" });
      }

      const res = await fetch("/api/whatsapp/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: waPhone.trim(),
          schedule_type: waTime,
          message_template: "plan_summary",
        }),
      });

      if (res.ok) {
        const updated = await fetch("/api/whatsapp/schedules").then((r) => r.json());
        setSchedules(Array.isArray(updated) ? updated : []);
        setWaMessage("✅ Successfully opted in for WhatsApp notifications!");
      } else {
        setWaMessage("❌ Failed to save preferences.");
      }
    } catch {
      setWaMessage("❌ Error saving preferences.");
    } finally {
      setWaOptInLoading(false);
    }
  }

  async function handleWaOptOut() {
    if (!confirm("Are you sure you want to stop receiving WhatsApp notifications?")) return;
    
    setWaOptInLoading(true);
    setWaMessage("");
    
    try {
      for (const s of schedules) {
        await fetch(`/api/whatsapp/schedules/${s.id}`, { method: "DELETE" });
      }
      setSchedules([]);
      setWaPhone("");
      setWaMessage("✅ Successfully opted out of notifications.");
    } catch {
      setWaMessage("❌ Error opting out.");
    } finally {
      setWaOptInLoading(false);
    }
  }

  if (loading) {
    return <div className="page-container"><div className="loading-center"><span className="loading-spinner lg" /></div></div>;
  }

  const isOptedIn = schedules.length > 0;

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
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>The base URL of your LiteLLM proxy or OpenAI-compatible API</span>
            </div>
            <div className="form-group">
              <label className="form-label">API Key (Optional)</label>
              <input className="form-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-... or leave empty" />
            </div>
            <div className="form-group">
              <label className="form-label">Model Name</label>
              <input className="form-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3.5:9b" />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>The model identifier recognized by your proxy</span>
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
      </form>

      {/* User WhatsApp Opt-in */}
      <div className="settings-section">
        <h2>📱 WhatsApp Notifications</h2>
        <p>Opt-in to receive daily AI-generated summaries of your health plan directly on your phone.</p>

        <form onSubmit={handleWaOptIn} className="settings-form" style={{ marginTop: "1rem" }}>
          <div className="form-group">
            <label className="form-label">Mobile Number</label>
            <input 
              className="form-input" 
              value={waPhone} 
              onChange={(e) => setWaPhone(e.target.value)} 
              placeholder="e.g. 919876543210 (include country code)" 
              required 
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Notification Time</label>
            <select className="form-select" value={waTime} onChange={(e) => setWaTime(e.target.value)}>
              <option value="daily_morning">🌅 Morning (8:00 AM) - Plan for the day</option>
              <option value="daily_evening">🌙 Evening (8:00 PM) - Review for tomorrow</option>
              <option value="twice_daily">🔄 Twice Daily (8 AM & 8 PM)</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
            <button type="submit" className="btn btn-primary" disabled={waOptInLoading}>
              {waOptInLoading ? (<><span className="loading-spinner" /> Saving...</>) : isOptedIn ? "🔄 Update Preferences" : "📲 Opt-In Now"}
            </button>
            
            {isOptedIn && (
              <button type="button" className="btn btn-danger" onClick={handleWaOptOut} disabled={waOptInLoading}>
                Stop Notifications
              </button>
            )}
          </div>
          
          {waMessage && <div className={waMessage.startsWith("✅") ? "form-success" : "form-error"}>{waMessage}</div>}
        </form>
      </div>

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
