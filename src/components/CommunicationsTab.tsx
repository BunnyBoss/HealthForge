"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { COUNTRY_OPTIONS, normalizeCountryIso, type CountryIso } from "@/lib/phone";

interface Plan {
  id: string;
  title: string;
  plan_type: string;
  created_at: string;
  model_used: string;
  content: string;
  focus_areas?: string[];
}

type QueueStatus = "pending" | "submitting" | "submitted" | "delivered" | "read" | "failed";

interface QueuedMessage {
  id: string;
  profile_id: string | null;
  group_id: string | null;
  message_text: string;
  scheduled_for: string;
  status: QueueStatus;
  target_phone: string;
  cc_phone: string | null;
  plan_id?: string | null;
  plan_title?: string | null;
  wa_message_id?: string | null;
  submitted_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  last_error?: string | null;
  attempt_count?: number;
  last_attempt_at?: string | null;
}

interface Props {
  profileId?: string;
  groupId?: string;
  entityName: string;
  onOpenChatWithPlan?: (plan: { id: string; title: string }) => void;
}

type PlanSortKey = "created_at" | "title" | "plan_type" | "model_used";

const STATUS_BADGE: Record<QueueStatus, { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Pending" },
  submitting: { bg: "rgba(14,165,233,0.16)", color: "#0ea5e9", label: "Submitting" },
  submitted: { bg: "rgba(59,130,246,0.16)", color: "#3b82f6", label: "Submitted" },
  delivered: { bg: "rgba(34,197,94,0.16)", color: "#22c55e", label: "Delivered" },
  read: { bg: "rgba(16,185,129,0.18)", color: "#10b981", label: "Read" },
  failed: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Failed" },
};

function iso(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function canEditMessage(status: QueueStatus): boolean {
  return status === "pending" || status === "failed";
}

export default function PlansNotificationsTab({ profileId, groupId, entityName, onOpenChatWithPlan }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [messages, setMessages] = useState<QueuedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminPhone, setAdminPhone] = useState("");
  const [defaultCountryIso, setDefaultCountryIso] = useState<CountryIso>("IN");

  // Plan table tools
  const [planSearch, setPlanSearch] = useState("");
  const [planSortBy, setPlanSortBy] = useState<PlanSortKey>("created_at");
  const [planSortDir, setPlanSortDir] = useState<"asc" | "desc">("desc");
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [planPage, setPlanPage] = useState(1);
  const [planPageSize, setPlanPageSize] = useState(5);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [planError, setPlanError] = useState("");

  // Manual plan creation
  const [showManualPlanForm, setShowManualPlanForm] = useState(false);
  const [manualPlanTitle, setManualPlanTitle] = useState("");
  const [manualPlanType, setManualPlanType] = useState("custom");
  const [manualPlanContent, setManualPlanContent] = useState("");
  const [manualFocusAreas, setManualFocusAreas] = useState("");

  // Notification generation form
  const [showForm, setShowForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [targetCountryIso, setTargetCountryIso] = useState<CountryIso>("IN");
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
  const [editCountryIso, setEditCountryIso] = useState<CountryIso>("IN");

  const queryParam = profileId ? `profile_id=${profileId}` : `group_id=${groupId}`;
  const planApiPath = profileId ? `/api/plans?profileId=${profileId}` : `/api/groups/${groupId}/plan`;

  async function fetchMessages() {
    const msgs = await fetch(`/api/messages?${queryParam}`).then((r) => r.json());
    setMessages(Array.isArray(msgs) ? msgs : []);
  }

  async function refreshAll() {
    setLoading(true);
    try {
      const [plansData, msgs, settings] = await Promise.all([
        fetch(planApiPath).then((r) => r.json()),
        fetch(`/api/messages?${queryParam}`).then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      setPlans(Array.isArray(plansData) ? plansData : []);
      setMessages(Array.isArray(msgs) ? msgs : []);
      setAdminPhone(settings.admin_phone || "");
      const normalizedCountry = normalizeCountryIso(settings.default_country_iso);
      setDefaultCountryIso(normalizedCountry);
      setTargetCountryIso(normalizedCountry);
      setEditCountryIso(normalizedCountry);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll().catch(() => setLoading(false));
  }, [queryParam, planApiPath]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchMessages().catch(() => {
        // best-effort poll
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [queryParam]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null;
  const openPlan = plans.find((p) => p.id === openPlanId) || null;

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    const base = q
      ? plans.filter((p) =>
        `${p.title} ${p.plan_type} ${p.model_used} ${p.content}`.toLowerCase().includes(q)
      )
      : plans;

    const sorted = [...base].sort((a, b) => {
      const dir = planSortDir === "asc" ? 1 : -1;
      if (planSortBy === "created_at") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      const av = (a[planSortBy] || "").toString().toLowerCase();
      const bv = (b[planSortBy] || "").toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });
    return sorted;
  }, [plans, planSearch, planSortBy, planSortDir]);

  const totalPlanPages = Math.max(1, Math.ceil(filteredPlans.length / planPageSize));
  const currentPlanPage = Math.min(planPage, totalPlanPages);
  const pagedPlans = filteredPlans.slice((currentPlanPage - 1) * planPageSize, currentPlanPage * planPageSize);
  const allFilteredSelected = filteredPlans.length > 0 && filteredPlans.every((p) => selectedPlanIds.includes(p.id));

  useEffect(() => {
    setPlanPage(1);
  }, [planSearch, planPageSize]);

  useEffect(() => {
    if (selectedPlanId && !plans.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId("");
    }
    if (openPlanId && !plans.some((p) => p.id === openPlanId)) {
      setOpenPlanId(null);
    }
    setSelectedPlanIds((prev) => prev.filter((id) => plans.some((p) => p.id === id)));
  }, [plans, selectedPlanId, openPlanId]);

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
          target_country_iso: targetCountryIso,
          cc_phone: ccSelf && adminPhone ? adminPhone : null,
          cc_country_iso: defaultCountryIso,
          days,
          schedule_time: scheduleTime,
          custom_context: customContext || null,
          recipient_name: entityName,
          plan_content: selectedPlan.content,
          plan_id: selectedPlan.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "Failed to generate");
        return;
      }
      await fetchMessages();
      setShowForm(false);
      setTargetPhone("");
      setDays(7);
      setScheduleTime("08:00");
      setCustomContext("");
      setCcSelf(false);
    } catch {
      setGenError("Failed to connect. Check your LLM settings.");
    } finally {
      setGenerating(false);
    }
  }

  async function createManualPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!manualPlanTitle.trim() || !manualPlanContent.trim()) return;

    setPlanActionBusy(true);
    setPlanError("");

    const areas = manualFocusAreas
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    try {
      const url = profileId ? "/api/plans" : `/api/groups/${groupId}/plan`;
      const body = profileId
        ? {
          profileId,
          action: "save",
          planType: manualPlanType,
          title: manualPlanTitle.trim(),
          content: manualPlanContent.trim(),
          focusAreas: areas,
        }
        : {
          action: "save",
          planType: manualPlanType,
          title: manualPlanTitle.trim(),
          content: manualPlanContent.trim(),
          focusAreas: areas,
        };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Failed to add manual plan");
        return;
      }
      await refreshAll();
      setShowManualPlanForm(false);
      setManualPlanTitle("");
      setManualPlanType("custom");
      setManualPlanContent("");
      setManualFocusAreas("");
      setOpenPlanId(data.id);
    } catch {
      setPlanError("Failed to add manual plan");
    } finally {
      setPlanActionBusy(false);
    }
  }

  function toggleSelectPlan(id: string) {
    setSelectedPlanIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedPlanIds((prev) => prev.filter((id) => !filteredPlans.some((p) => p.id === id)));
      return;
    }
    const set = new Set(selectedPlanIds);
    filteredPlans.forEach((p) => set.add(p.id));
    setSelectedPlanIds(Array.from(set));
  }

  async function deletePlans(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} plan(s)? This cannot be undone.`)) return;

    setPlanActionBusy(true);
    setPlanError("");
    try {
      const url = profileId ? "/api/plans" : `/api/groups/${groupId}/plan`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Failed to delete plans");
        return;
      }
      await refreshAll();
      setSelectedPlanIds((prev) => prev.filter((id) => !ids.includes(id)));
      if (openPlanId && ids.includes(openPlanId)) {
        setOpenPlanId(null);
      }
    } catch {
      setPlanError("Failed to delete plans");
    } finally {
      setPlanActionBusy(false);
    }
  }

  function exportPlansCsv() {
    if (filteredPlans.length === 0) return;
    const escapeCsv = (v: string) => `"${v.replace(/"/g, "\"\"")}"`;
    const rows = filteredPlans.map((p) => [
      p.id,
      p.title,
      p.plan_type,
      p.model_used,
      new Date(p.created_at).toISOString(),
      p.content,
    ]);

    const csv = [
      ["id", "title", "plan_type", "model_used", "created_at", "content"],
      ...rows,
    ]
      .map((r) => r.map((x) => escapeCsv(String(x ?? ""))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityName.replace(/\s+/g, "_")}_plans.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/messages/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_text: editText,
        scheduled_for: editTime ? new Date(editTime).toISOString() : undefined,
        target_phone: editPhone || undefined,
        target_country_iso: editCountryIso,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Failed to update message");
      return;
    }
    await fetchMessages();
    setEditingId(null);
  }

  async function deleteMsg(id: string) {
    if (!confirm("Delete this notification?")) return;
    await fetch(`/api/messages/${id}`, { method: "DELETE" });
    await fetchMessages();
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
    setEditCountryIso(defaultCountryIso);
  }

  if (loading) return <div className="loading-center"><span className="loading-spinner" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="section-title" style={{ marginBottom: "0.75rem" }}>📑 All Plans</div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto auto auto", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <input className="form-input" placeholder="Search title/type/model/content..." value={planSearch} onChange={(e) => setPlanSearch(e.target.value)} />
        <select className="form-select" value={planSortBy} onChange={(e) => setPlanSortBy(e.target.value as PlanSortKey)}>
          <option value="created_at">Sort: Created</option>
          <option value="title">Sort: Title</option>
          <option value="plan_type">Sort: Type</option>
          <option value="model_used">Sort: Model</option>
        </select>
        <select className="form-select" value={planSortDir} onChange={(e) => setPlanSortDir(e.target.value as "asc" | "desc")}>
          <option value="desc">Newest / Z-A</option>
          <option value="asc">Oldest / A-Z</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => refreshAll()} disabled={planActionBusy}>↻ Refresh</button>
        <button className="btn btn-secondary btn-sm" onClick={exportPlansCsv} disabled={filteredPlans.length === 0}>⬇ Export CSV</button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setPlanSearch(""); setPlanSortBy("created_at"); setPlanSortDir("desc"); }}>Reset</button>
        <button className="btn btn-primary btn-sm" onClick={() => setShowManualPlanForm((v) => !v)}>
          {showManualPlanForm ? "✕ Cancel" : "+ Add Manual Plan"}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Showing {filteredPlans.length === 0 ? 0 : (currentPlanPage - 1) * planPageSize + 1}-{Math.min(currentPlanPage * planPageSize, filteredPlans.length)} of {filteredPlans.length} filtered plan(s)
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="form-select" value={planPageSize} onChange={(e) => setPlanPageSize(Number(e.target.value))}>
            <option value={5}>5 / page</option>
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
          </select>
          <button className="btn btn-danger btn-sm" disabled={selectedPlanIds.length === 0 || planActionBusy} onClick={() => deletePlans(selectedPlanIds)}>
            🗑 Delete Selected ({selectedPlanIds.length})
          </button>
        </div>
      </div>

      {showManualPlanForm && (
        <div className="health-info-card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>✍ Add Manual Plan</h3>
          <form onSubmit={createManualPlan}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.6rem" }}>
              <input className="form-input" placeholder="Plan title" value={manualPlanTitle} onChange={(e) => setManualPlanTitle(e.target.value)} required />
              <select className="form-select" value={manualPlanType} onChange={(e) => setManualPlanType(e.target.value)}>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="custom">custom</option>
              </select>
              <input className="form-input" placeholder="Focus areas (comma separated)" value={manualFocusAreas} onChange={(e) => setManualFocusAreas(e.target.value)} />
            </div>
            <textarea className="form-textarea" placeholder="Write the full plan content..." value={manualPlanContent} onChange={(e) => setManualPlanContent(e.target.value)} style={{ minHeight: "140px", marginTop: "0.75rem" }} required />
            <div style={{ marginTop: "0.75rem" }}>
              <button className="btn btn-primary" type="submit" disabled={planActionBusy}>
                {planActionBusy ? "Saving..." : "Save Manual Plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {planError && <div className="form-error" style={{ marginBottom: "0.75rem" }}>{planError}</div>}

      {plans.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "2rem", padding: "1rem", textAlign: "center", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
          No plans generated yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th style={th}><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} /></th>
                <th style={th}>Plan ID</th>
                <th style={th}>Title</th>
                <th style={th}>Type</th>
                <th style={th}>Created</th>
                <th style={th}>Model</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedPlans.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", background: openPlanId === p.id ? "rgba(56,189,248,0.06)" : "transparent" }} onClick={() => setOpenPlanId((curr) => (curr === p.id ? null : p.id))}>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedPlanIds.includes(p.id)} onChange={() => toggleSelectPlan(p.id)} />
                  </td>
                  <td style={td}><code style={{ fontSize: "0.72rem", opacity: 0.7 }}>{p.id.slice(0, 8)}…</code></td>
                  <td style={{ ...td, fontWeight: 600, color: "var(--accent-primary)" }}>{p.title}</td>
                  <td style={td}><span style={chip}>{p.plan_type}</span></td>
                  <td style={td}>{new Date(p.created_at).toLocaleString()}</td>
                  <td style={{ ...td, opacity: 0.7 }}>{p.model_used}</td>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpenPlanId((curr) => (curr === p.id ? null : p.id))}>
                        {openPlanId === p.id ? "Hide" : "View"}
                      </button>
                      {onOpenChatWithPlan && (
                        <button className="btn btn-primary btn-sm" onClick={() => onOpenChatWithPlan(p)}>
                          Chat
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => deletePlans([p.id])} disabled={planActionBusy}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredPlans.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPlanPage((p) => Math.max(1, p - 1))} disabled={currentPlanPage <= 1}>← Prev</button>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Page {currentPlanPage} of {totalPlanPages}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setPlanPage((p) => Math.min(totalPlanPages, p + 1))} disabled={currentPlanPage >= totalPlanPages}>Next →</button>
        </div>
      )}

      {openPlan && (
        <div className="health-info-card" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>📄 {openPlan.title}</h3>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {openPlan.plan_type} · {new Date(openPlan.created_at).toLocaleString()} · {openPlan.model_used}
            </div>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.84rem", color: "var(--text-primary)" }}>{openPlan.content}</pre>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div className="section-title" style={{ margin: 0 }}>📬 Notification Queue</div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Auto-refresh every 10 seconds</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {messages.length > 0 && <button className="btn btn-secondary btn-sm" onClick={clearAllMsgs}>🗑️ Clear All</button>}
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)} disabled={plans.length === 0} title={plans.length === 0 ? "Generate a health plan first" : ""}>
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

      {showForm && plans.length > 0 && (
        <div className="health-info-card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>✨ Generate AI Message Schedule</h3>
          <form onSubmit={generate}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
              <div className="form-group">
                <label className="form-label">Based on Plan</label>
                <select className="form-select" value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.title} ({new Date(p.created_at).toLocaleDateString()})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Target Country</label>
                <select className="form-select" value={targetCountryIso} onChange={(e) => setTargetCountryIso(normalizeCountryIso(e.target.value))}>
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.iso} value={country.iso}>{country.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Target Phone *</label>
                <input className="form-input" value={targetPhone} onChange={(e) => setTargetPhone(e.target.value)} placeholder="e.g. 9876543210 or +919876543210" required />
              </div>
              <div className="form-group">
                <label className="form-label">Days</label>
                <input className="form-input" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Daily Send Time</label>
                <input className="form-input" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="checkbox" checked={ccSelf} onChange={(e) => setCcSelf(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }} />
                <span className="form-label" style={{ margin: 0 }}>
                  CC admin number {adminPhone ? `(+${adminPhone})` : "(set in Settings → Admin Settings)"}
                </span>
              </label>
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label className="form-label">Custom AI Instructions (Optional)</label>
              <textarea className="form-textarea" value={customContext} onChange={(e) => setCustomContext(e.target.value)} placeholder="e.g. 'Use a strict coach tone' or 'Remind to take medication'" style={{ minHeight: "60px" }} />
            </div>
            {genError && <div className="form-error" style={{ marginBottom: "0.75rem" }}>{genError}</div>}
            <button type="submit" className="btn btn-primary" disabled={generating || !targetPhone.trim()}>
              {generating ? (<><span className="loading-spinner" /> Generating {days} messages...</>) : `✨ Generate ${days} Messages`}
            </button>
          </form>
        </div>
      )}

      {messages.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1.5rem", textAlign: "center", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
          No notifications scheduled. {plans.length > 0 ? "Click \"Generate Messages\" to create a queue." : ""}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                <th style={th}>ID</th>
                <th style={th}>Plan</th>
                <th style={th}>Notification</th>
                <th style={th}>Scheduled</th>
                <th style={th}>Phone</th>
                <th style={th}>Transport Status</th>
                <th style={th}>Timeline</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} style={{ borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" }}>
                  {editingId === msg.id ? (
                    <>
                      <td style={td}><code style={{ fontSize: "0.7rem", opacity: 0.6 }}>{msg.id.slice(0, 8)}…</code></td>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: "var(--accent-primary)" }}>{msg.plan_title || "Unknown Plan"}</div>
                        <code style={{ fontSize: "0.7rem", opacity: 0.6 }}>{msg.plan_id ? `${msg.plan_id.slice(0, 8)}…` : "—"}</code>
                      </td>
                      <td style={{ ...td, minWidth: "220px" }}>
                        <textarea className="form-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} style={{ minHeight: "70px", fontSize: "0.8rem", width: "100%" }} />
                      </td>
                      <td style={td}>
                        <input className="form-input" type="datetime-local" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ minWidth: "170px" }} />
                      </td>
                      <td style={td}>
                        <select className="form-select" value={editCountryIso} onChange={(e) => setEditCountryIso(normalizeCountryIso(e.target.value))} style={{ minWidth: "170px", marginBottom: "0.35rem" }}>
                          {COUNTRY_OPTIONS.map((country) => (
                            <option key={country.iso} value={country.iso}>{country.label}</option>
                          ))}
                        </select>
                        <input className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" style={{ minWidth: "130px" }} />
                      </td>
                      <td style={td} />
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
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: "var(--accent-primary)" }}>{msg.plan_title || "Unknown Plan"}</div>
                        <code style={{ fontSize: "0.7rem", opacity: 0.6 }}>{msg.plan_id ? `${msg.plan_id.slice(0, 8)}…` : "—"}</code>
                      </td>
                      <td style={{ ...td, maxWidth: "320px", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>{msg.message_text}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(msg.scheduled_for).toLocaleString()}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        +{msg.target_phone}
                        {msg.cc_phone && <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>CC: +{msg.cc_phone}</div>}
                      </td>
                      <td style={td}>
                        <span style={{ padding: "0.15rem 0.5rem", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 700, background: STATUS_BADGE[msg.status]?.bg, color: STATUS_BADGE[msg.status]?.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {STATUS_BADGE[msg.status]?.label || msg.status}
                        </span>
                        {msg.last_error && (
                          <div style={{ marginTop: "0.35rem", fontSize: "0.72rem", color: "#ef4444", maxWidth: "220px", whiteSpace: "pre-wrap" }}>
                            Error: {msg.last_error}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, minWidth: "180px", fontSize: "0.74rem", lineHeight: "1.4" }}>
                        <div>Submitted: {iso(msg.submitted_at)}</div>
                        <div>Delivered: {iso(msg.delivered_at)}</div>
                        <div>Read: {iso(msg.read_at)}</div>
                        <div>Attempts: {msg.attempt_count ?? 0}</div>
                      </td>
                      <td style={td}>
                        {canEditMessage(msg.status) && (
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

const th: CSSProperties = {
  padding: "0.6rem 0.75rem",
  textAlign: "left",
  color: "var(--text-muted)",
  fontWeight: 600,
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const td: CSSProperties = {
  padding: "0.6rem 0.75rem",
  color: "var(--text-primary)",
};

const chip: CSSProperties = {
  background: "var(--accent-primary-dim)",
  color: "var(--accent-primary)",
  padding: "0.15rem 0.5rem",
  borderRadius: "100px",
  fontSize: "0.72rem",
  fontWeight: 600,
};
