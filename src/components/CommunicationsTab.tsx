"use client";

import { useEffect, useState } from "react";

interface Plan {
  id: string;
  title: string;
  plan_type: string;
  created_at: string;
  model_used: string;
  content: string;
}

interface QueuedMessage {
  id: string;
  profile_id: string | null;
  group_id: string | null;
  message_text: string;
  scheduled_for: string;
  status: "pending" | "sent" | "failed";
  target_phone: string;
  cc_phone: string | null;
  plan_id?: string | null; // virtual — we'll map it
}

interface Props {
  profileId?: string;
  groupId?: string;
  entityName: string;
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  sent:    { bg: "rgba(34,197,94,0.15)",  color: "#22c55e" },
  failed:  { bg: "rgba(239,68,68,0.15)",  color: "#ef4444" },
};

export default function PlansNotificationsTab({ profileId, groupId, entityName }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [messages, setMessages] = useState<QueuedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminPhone, setAdminPhone] = useState("");

  // Notification generation form
  const [showForm, setShowForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [ccSelf, setCcSelf] = useState(false);
  const [days, setDays] = useState(7);
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [customContext, setCustomContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // Inline edit state for notifications
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const queryParam = profileId ? `profile_id=${profileId}` : `group_id=${groupId}`;
  const planApiPath = profileId ? `/api/plans?profileId=${profileId}` : `/api/groups/${groupId}/plan`;

  useEffect(() => {
    Promise.all([
      fetch(planApiPath).then(r => r.json()),
      fetch(`/api/messages?${queryParam}`).then(r => r.json()),
      fetch("/api/settings").then(r => r.json()),
    ]).then(([plansData, msgs, settings]) => {
      setPlans(Array.isArray(plansData) ? plansData : []);
      setMessages(Array.isArray(msgs) ? msgs : []);
      setAdminPhone(settings.admin_phone || "");
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [queryParam, planApiPath]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) ?? plans[0] ?? null;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan) return;
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId ?? null,
          group_id: groupId ?? null,
          target_phone: targetPhone.trim(),
          cc_phone: ccSelf && adminPhone ? adminPhone : null,
          days,
          schedule_time: scheduleTime,
          custom_context: customContext || null,
          recipient_name: entityName,
          plan_content: selectedPlan.content,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error || "Failed to generate"); return; }
      const refreshed = await fetch(`/api/messages?${queryParam}`).then(r => r.json());
      setMessages(Array.isArray(refreshed) ? refreshed : []);
      setShowForm(false);
      setTargetPhone(""); setDays(7); setScheduleTime("08:00"); setCustomContext(""); setCcSelf(false);
    } catch {
      setGenError("Failed to connect. Check your LLM settings.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveEdit(id: string) {
    await fetch(`/api/messages/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_text: editText,
        scheduled_for: editTime ? new Date(editTime).toISOString() : undefined,
        target_phone: editPhone || undefined,
      }),
    });
    setMessages(prev => prev.map(m =>
      m.id === id
        ? { ...m, message_text: editText, scheduled_for: editTime ? new Date(editTime).toISOString() : m.scheduled_for, target_phone: editPhone || m.target_phone }
        : m
    ));
    setEditingId(null);
  }

  async function deleteMsg(id: string) {
    if (!confirm("Delete this notification?")) return;
    await fetch(`/api/messages/${id}`, { method: "DELETE" });
    setMessages(prev => prev.filter(m => m.id !== id));
  }

  async function clearAllMsgs() {
    if (!confirm(`Clear all notifications for ${entityName}?`)) return;
    await fetch(`/api/messages?${queryParam}`, { method: "DELETE" });
    setMessages([]);
  }

  function startEdit(msg: QueuedMessage) {
    setEditingId(msg.id);
    setEditText(msg.message_text);
    setEditTime(msg.scheduled_for.slice(0, 16));
    setEditPhone(msg.target_phone);
  }

  if (loading) return <div className="loading-center"><span className="loading-spinner" /></div>;

  return (
    <div className="animate-fade-in">
      {/* ── PLANS TABLE ─────────────────────────────── */}
      <div className="section-title" style={{ marginBottom: "0.75rem" }}>📑 All Plans</div>
      {plans.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "2rem", padding: "1rem", textAlign: "center", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
          No plans generated yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: "2rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th style={th}>Plan ID</th>
                <th style={th}>Title</th>
                <th style={th}>Type</th>
                <th style={th}>Created</th>
                <th style={th}>Model</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={td}><code style={{ fontSize: "0.72rem", opacity: 0.7 }}>{p.id.slice(0, 8)}…</code></td>
                  <td style={{ ...td, fontWeight: 600, color: "var(--accent-primary)" }}>{p.title}</td>
                  <td style={td}><span style={chip}>{p.plan_type}</span></td>
                  <td style={td}>{new Date(p.created_at).toLocaleString()}</td>
                  <td style={{ ...td, opacity: 0.7 }}>{p.model_used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── NOTIFICATIONS TABLE ──────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div className="section-title" style={{ margin: 0 }}>📬 Notification Schedule</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {messages.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={clearAllMsgs}>🗑️ Clear All</button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm(!showForm)}
            disabled={plans.length === 0}
            title={plans.length === 0 ? "Generate a health plan first" : ""}
          >
            {showForm ? "✕ Cancel" : "✨ Generate Messages"}
          </button>
        </div>
      </div>

      {plans.length === 0 && (
        <div className="disclaimer" style={{ marginBottom: "1rem" }}>
          <span className="icon">ℹ️</span>
          <span>Generate a health plan first, then schedule notifications.</span>
        </div>
      )}

      {/* Generation Form */}
      {showForm && plans.length > 0 && (
        <div className="health-info-card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>✨ Generate AI Message Schedule</h3>
          <form onSubmit={generate}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
              <div className="form-group">
                <label className="form-label">Based on Plan</label>
                <select className="form-select" value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.title} ({new Date(p.created_at).toLocaleDateString()})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Target Phone *</label>
                <input className="form-input" value={targetPhone} onChange={e => setTargetPhone(e.target.value)} placeholder="919876543210" required />
              </div>
              <div className="form-group">
                <label className="form-label">Days</label>
                <input className="form-input" type="number" min={1} max={30} value={days} onChange={e => setDays(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Daily Send Time</label>
                <input className="form-input" type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="checkbox" checked={ccSelf} onChange={e => setCcSelf(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }} />
                <span className="form-label" style={{ margin: 0 }}>
                  CC admin number {adminPhone ? `(${adminPhone})` : "(set in Settings → Admin Settings)"}
                </span>
              </label>
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label className="form-label">Custom AI Instructions (Optional)</label>
              <textarea className="form-textarea" value={customContext} onChange={e => setCustomContext(e.target.value)} placeholder="e.g. 'Use a strict coach tone' or 'Remind to take medication'" style={{ minHeight: "60px" }} />
            </div>
            {genError && <div className="form-error" style={{ marginBottom: "0.75rem" }}>{genError}</div>}
            <button type="submit" className="btn btn-primary" disabled={generating || !targetPhone.trim()}>
              {generating ? (<><span className="loading-spinner" /> Generating {days} messages...</>) : `✨ Generate ${days} Messages`}
            </button>
          </form>
        </div>
      )}

      {/* Notifications Table */}
      {messages.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1.5rem", textAlign: "center", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
          No notifications scheduled. {plans.length > 0 ? "Click \"Generate Messages\" to create a schedule." : ""}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th style={th}>ID</th>
                <th style={th}>Notification</th>
                <th style={th}>Scheduled For</th>
                <th style={th}>Phone</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map(msg => (
                <tr key={msg.id} style={{ borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" }}>
                  {editingId === msg.id ? (
                    <>
                      <td style={td}><code style={{ fontSize: "0.7rem", opacity: 0.6 }}>{msg.id.slice(0, 8)}…</code></td>
                      <td style={{ ...td, minWidth: "220px" }}>
                        <textarea
                          className="form-textarea"
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          style={{ minHeight: "70px", fontSize: "0.8rem", width: "100%" }}
                        />
                      </td>
                      <td style={td}>
                        <input className="form-input" type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} style={{ minWidth: "170px" }} />
                      </td>
                      <td style={td}>
                        <input className="form-input" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" style={{ minWidth: "130px" }} />
                      </td>
                      <td style={td} />
                      <td style={td}>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button className="btn btn-primary btn-sm" onClick={() => saveEdit(msg.id)}>💾</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>✕</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}><code style={{ fontSize: "0.7rem", opacity: 0.6 }}>{msg.id.slice(0, 8)}…</code></td>
                      <td style={{ ...td, maxWidth: "300px", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>{msg.message_text}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(msg.scheduled_for).toLocaleString()}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {msg.target_phone}
                        {msg.cc_phone && <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>CC: {msg.cc_phone}</div>}
                      </td>
                      <td style={td}>
                        <span style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: "100px",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          background: STATUS_BADGE[msg.status]?.bg,
                          color: STATUS_BADGE[msg.status]?.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}>
                          {msg.status}
                        </span>
                      </td>
                      <td style={td}>
                        {msg.status !== "sent" && (
                          <div style={{ display: "flex", gap: "0.4rem" }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => startEdit(msg)} title="Edit">✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteMsg(msg.id)} title="Delete">🗑️</button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  textAlign: "left",
  color: "var(--text-muted)",
  fontWeight: 600,
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  color: "var(--text-primary)",
};

const chip: React.CSSProperties = {
  background: "var(--accent-primary-dim)",
  color: "var(--accent-primary)",
  padding: "0.15rem 0.5rem",
  borderRadius: "100px",
  fontSize: "0.72rem",
  fontWeight: 600,
};
