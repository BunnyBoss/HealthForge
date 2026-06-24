"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { COUNTRY_OPTIONS, normalizeCountryIso, type CountryIso } from "@/lib/phone";

type ApiKeySource = "user" | "env" | "none";
type WhatsAppStatus = "disconnected" | "connecting" | "connected";

interface WhatsAppConnection {
  status: WhatsAppStatus;
  is_connected: boolean;
  phone_number: string | null;
  has_auth: boolean;
  qr: string | null;
  qr_data_url?: string | null;
}

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeySource, setApiKeySource] = useState<ApiKeySource>("none");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [model, setModel] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [defaultCountryIso, setDefaultCountryIso] = useState<CountryIso>("IN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [whatsApp, setWhatsApp] = useState<WhatsAppConnection | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");

  async function loadSettings() {
    const res = await fetch("/api/settings");
    const settings = await res.json();
    setApiUrl(settings.api_url || "http://localhost:4000");
    setApiKey("");
    setHasApiKey(Boolean(settings.has_api_key));
    setApiKeySource((settings.api_key_source || "none") as ApiKeySource);
    setClearApiKey(false);
    setModel(settings.preferred_model || "gpt-4o");
    setAdminPhone(settings.admin_phone || "");
    const defaultCountry = normalizeCountryIso(settings.default_country_iso);
    setDefaultCountryIso(defaultCountry);
  }

  async function loadWhatsAppStatus() {
    const res = await fetch("/api/whatsapp/status");
    if (!res.ok) throw new Error("Failed to load WhatsApp status");
    const status = await res.json();
    setWhatsApp(status);
  }

  useEffect(() => {
    Promise.all([
      loadSettings(),
      loadWhatsAppStatus().catch(() => undefined),
    ]).catch(() => undefined).finally(() => setLoading(false));
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
        await loadSettings();
        setMessage("Settings saved successfully!");
      } else {
        setMessage("Failed to save settings");
      }
    } catch {
      setMessage("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function resetAiDefaults() {
    setSaving(true);
    setMessage("");
    setTestResult("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reset_ai_defaults: true,
          admin_phone: adminPhone,
          default_country_iso: defaultCountryIso,
        }),
      });
      if (res.ok) {
        await loadSettings();
        setMessage("AI settings reset to .env defaults.");
      } else {
        setMessage("Failed to reset AI settings");
      }
    } catch {
      setMessage("Error resetting AI settings");
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

  async function connectWhatsApp() {
    setWhatsAppLoading(true);
    setWhatsAppMessage("");
    try {
      const res = await fetch("/api/whatsapp/login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setWhatsAppMessage(data.error || "Failed to start WhatsApp pairing");
        return;
      }
      setWhatsApp(data);
      setWhatsAppMessage(data.qr_data_url ? "Scan the QR code with WhatsApp to connect this user." : "WhatsApp connection started. Refresh status in a moment.");
    } catch {
      setWhatsAppMessage("Failed to start WhatsApp pairing");
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function refreshWhatsAppStatus() {
    setWhatsAppLoading(true);
    setWhatsAppMessage("");
    try {
      await loadWhatsAppStatus();
      setWhatsAppMessage("WhatsApp status refreshed.");
    } catch {
      setWhatsAppMessage("Failed to refresh WhatsApp status");
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function logoutWhatsApp() {
    setWhatsAppLoading(true);
    setWhatsAppMessage("");
    try {
      const res = await fetch("/api/whatsapp/logout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setWhatsAppMessage(data.error || "Failed to logout WhatsApp");
        return;
      }
      setWhatsApp(data);
      setWhatsAppMessage("WhatsApp disconnected for this user.");
    } catch {
      setWhatsAppMessage("Failed to logout WhatsApp");
    } finally {
      setWhatsAppLoading(false);
    }
  }

  if (loading) {
    return <div className="page-container"><div className="loading-center"><span className="loading-spinner lg" /></div></div>;
  }

  const apiKeyLabel = apiKeySource === "user"
    ? "A custom API key is stored. Leave the input blank to keep using it, or enter a new one to replace it."
    : apiKeySource === "env"
      ? "Using the default API key from .env. The key is hidden and is never sent to this page."
      : "No key is currently stored or configured in .env.";
  const whatsAppStatus = whatsApp?.status || "disconnected";
  const whatsAppStatusLabel = whatsAppStatus === "connected"
    ? `Connected${whatsApp?.phone_number ? ` as +${whatsApp.phone_number}` : ""}`
    : whatsAppStatus === "connecting"
      ? "Connecting"
      : "Disconnected";

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
                  placeholder={hasApiKey && !clearApiKey ? "●●●●●●●● (Hidden)" : "sk-... or leave empty"}
                  style={{ flex: "1 1 200px" }}
                />
                {apiKeySource === "user" && (
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
                {clearApiKey
                  ? <span style={{ color: "var(--danger)" }}>⚠️ The custom API key will be deleted upon saving. The .env key will be used if configured.</span>
                  : apiKeyLabel}
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
              <button type="button" className="btn btn-secondary" onClick={resetAiDefaults} disabled={saving}>
                Reset AI Defaults
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

        <div className="settings-section">
          <h2>🔗 WhatsApp Connection</h2>
          <p>Connect the WhatsApp account used only for your reminder messages.</p>
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">Connection Status</label>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-card)",
                  color: whatsAppStatus === "connected" ? "#22c55e" : whatsAppStatus === "connecting" ? "var(--accent-warm)" : "var(--text-secondary)",
                  fontWeight: 700,
                }}
              >
                {whatsAppStatusLabel}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                Each HealthForge user must connect their own WhatsApp account. Messages queued by another user cannot use this connection.
              </div>
            </div>

            {whatsApp?.qr_data_url && (
              <div className="form-group">
                <label className="form-label">Scan QR Code</label>
                <div style={{ display: "inline-block", padding: "0.75rem", background: "#fff", borderRadius: "8px" }}>
                  <Image src={whatsApp.qr_data_url} alt="WhatsApp pairing QR code" width={220} height={220} unoptimized style={{ display: "block" }} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={connectWhatsApp} disabled={whatsAppLoading || whatsAppStatus === "connected"}>
                {whatsAppLoading ? (<><span className="loading-spinner" /> Working...</>) : "Connect WhatsApp"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={refreshWhatsAppStatus} disabled={whatsAppLoading}>
                Refresh Status
              </button>
              <button type="button" className="btn btn-secondary" onClick={logoutWhatsApp} disabled={whatsAppLoading || (!whatsApp?.has_auth && whatsAppStatus === "disconnected")}>
                Logout WhatsApp
              </button>
            </div>
            {whatsAppMessage && <div className={whatsAppMessage.includes("Failed") ? "form-error" : "form-success"}>{whatsAppMessage}</div>}
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
