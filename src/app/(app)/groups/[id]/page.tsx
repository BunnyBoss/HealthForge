"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import CommunicationsTab from "@/components/CommunicationsTab";
import PlanDocument from "@/components/PlanDocument";

interface Profile {
  id: string;
  name: string;
  relationship: string;
  age?: number;
  gender?: string;
  dietary_preference?: string;
  medical_conditions: string[];
  allergies: string[];
  medications: string[];
  goals: string[];
}

interface GroupData {
  id: string;
  name: string;
  description: string;
  group_type: string;
  group_goals: string[];
  members: Profile[];
}

interface Plan {
  id: string;
  title: string;
  plan_type: string;
  content: string;
  model_used: string;
  created_at: string;
  focus_areas: string[];
  isTemp?: boolean;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

const FOCUS_AREAS = [
  "🍽️ Diet & Nutrition", "🏋️ Exercise & Fitness", "😴 Sleep & Recovery",
  "🧘 Stress Management", "💊 Supplements", "💧 Hydration",
  "🧠 Mental Wellness", "❤️ Heart Health",
];

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Plans
  const [plans, setPlans] = useState<Plan[]>([]);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState("");

  useEffect(() => {
    fetch(`/api/groups/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setGroup(null);
        else setGroup(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (activeTab === "plan") {
      fetch(`/api/groups/${id}/plan`)
        .then((r) => r.json())
        .then((data) => setPlans(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [activeTab, id]);

  const toggleFocus = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const generatePlan = async () => {
    setGeneratingPlan(true);
    setPlanError("");
    setActivePlan(null);
    try {
      const res = await fetch(`/api/groups/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusAreas, action: "generate" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Failed to generate plan");
      } else {
        setActivePlan(data);
      }
    } catch {
      setPlanError("Failed to connect to AI. Check your LLM settings.");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const [savingPlan, setSavingPlan] = useState(false);
  const savePlan = async () => {
    if (!activePlan || !activePlan.isTemp) return;
    setSavingPlan(true);
    setPlanError("");

    try {
      const res = await fetch(`/api/groups/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focusAreas: activePlan.focus_areas,
          action: "save",
          content: activePlan.content,
          title: activePlan.title,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Failed to save plan");
      } else {
        setActivePlan(data); // Replaces temp plan with saved plan (no isTemp)
        alert("Plan saved successfully! It is now available in the Plans & Notifications tab.");
      }
    } catch {
      setPlanError("Failed to save plan.");
    } finally {
      setSavingPlan(false);
    }
  };

  // Chat Sessions state
  const [sessions, setSessions] = useState<{ id: string; title: string; updated_at: string; plan_id?: string | null }[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedChatPlanId, setSelectedChatPlanId] = useState<string>("");
  const [pendingNewChat, setPendingNewChat] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [chatPlanDraft, setChatPlanDraft] = useState<Plan | null>(null);
  const [chatPlanBusy, setChatPlanBusy] = useState(false);
  const [chatPlanError, setChatPlanError] = useState("");

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫",
      friend: "🤝", colleague: "💼", other: "👤",
    };
    return icons[rel] || "👤";
  };

  useEffect(() => {
    if (activeTab === "chat") {
      if (plans.length === 0) {
        fetch(`/api/groups/${id}/plan`)
          .then((r) => r.json())
          .then((data) => setPlans(Array.isArray(data) ? data : []))
          .catch(() => {});
      }
      fetch(`/api/chat/sessions?groupId=${id}`)
        .then((r) => r.json())
        .then((data) => {
          const sessionsList = Array.isArray(data) ? data : [];
          setSessions(sessionsList);
          if (sessionsList.length > 0 && !activeSessionId && !selectedChatPlanId && !pendingNewChat) {
            setActiveSessionId(sessionsList[0].id);
            setSelectedChatPlanId(sessionsList[0].plan_id || "");
          }
        })
        .catch(() => {});
    }
  }, [activeTab, id, plans.length, activeSessionId, selectedChatPlanId, pendingNewChat]);

  useEffect(() => {
    if (activeTab === "chat" && activeSessionId) {
      fetch(`/api/chat?sessionId=${activeSessionId}`)
        .then((r) => r.json())
        .then((data) => setMessages(Array.isArray(data) ? data : []))
        .catch(() => {});
    } else if (activeTab === "chat" && !activeSessionId) {
      setMessages([]);
    }
  }, [activeTab, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session?.plan_id) {
      setSelectedChatPlanId(session.plan_id);
    }
  }, [activeSessionId, sessions]);

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setPendingNewChat(true);
    setChatPlanDraft(null);
    setChatPlanError("");
  };

  const openChatWithPlan = (plan: { id: string; title: string }) => {
    setSelectedChatPlanId(plan.id);
    setActiveSessionId(null);
    setMessages([]);
    setPendingNewChat(true);
    setChatPlanDraft(null);
    setChatPlanError("");
    setActiveTab("chat");
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || streaming) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", content: userMsg, created_at: new Date().toISOString() },
    ]);
    setStreaming(true);
    setStreamedContent("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: id, message: userMsg, sessionId: activeSessionId, planId: selectedChatPlanId || null }),
      });

      const newSessionId = res.headers.get("X-Session-ID");
      if (newSessionId && newSessionId !== activeSessionId) {
        setActiveSessionId(newSessionId);
        setPendingNewChat(false);
        fetch(`/api/chat/sessions?groupId=${id}`)
          .then((r) => r.json())
          .then((data) => setSessions(Array.isArray(data) ? data : []));
      }

      if (!res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: "assistant", content: `❌ Error: ${data.error}`, created_at: new Date().toISOString() },
        ]);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const json = JSON.parse(line.slice(6));
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  setStreamedContent(fullContent);
                }
              } catch {
                // skip
              }
            }
          }
        }
      }

      if (fullContent) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: "assistant", content: fullContent, created_at: new Date().toISOString() },
        ]);
      }
      setStreamedContent("");
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: "❌ Failed to connect to AI. Check your LLM settings.", created_at: new Date().toISOString() },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  const createPlanFromChat = async () => {
    if (!activeSessionId) {
      setChatPlanError("Start or open a chat session first.");
      return;
    }
    setChatPlanBusy(true);
    setChatPlanError("");
    try {
      const res = await fetch("/api/chat/session-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: id,
          sessionId: activeSessionId,
          planId: selectedChatPlanId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatPlanError(data.error || "Failed to create plan draft from chat");
        return;
      }
      setChatPlanDraft(data);
    } catch {
      setChatPlanError("Failed to create plan draft from chat.");
    } finally {
      setChatPlanBusy(false);
    }
  };

  const saveChatPlanDraft = async () => {
    if (!chatPlanDraft) return;
    setChatPlanBusy(true);
    setChatPlanError("");
    try {
      const res = await fetch(`/api/groups/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType: chatPlanDraft.plan_type || "custom",
          focusAreas: chatPlanDraft.focus_areas || [],
          action: "save",
          content: chatPlanDraft.content,
          title: chatPlanDraft.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatPlanError(data.error || "Failed to save chat-customized group plan");
        return;
      }
      setPlans((prev) => [data, ...prev]);
      setActivePlan(data);
      setActiveTab("plan");
      setChatPlanDraft(null);
    } catch {
      setChatPlanError("Failed to save chat-customized group plan.");
    } finally {
      setChatPlanBusy(false);
    }
  };

  if (loading) {
    return <div className="page-container"><div className="loading-center"><span className="loading-spinner lg" /></div></div>;
  }

  if (!group) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="icon">❌</div>
          <h3>Group not found</h3>
          <Link href="/profiles" className="btn btn-primary">Back to Profiles</Link>
        </div>
      </div>
    );
  }

  // Detect conflicts
  const allAllergies = [...new Set(group.members.flatMap((m) => m.allergies || []))];
  const allConditions = [...new Set(group.members.flatMap((m) => m.medical_conditions || []))];
  const dietaryPrefs = [...new Set(group.members.map((m) => m.dietary_preference).filter(Boolean) as string[])];
  const hasConflicts = dietaryPrefs.length > 1 || allConditions.length > 0;

  return (
    <div className="page-container animate-fade-in">
      <Link href="/profiles" className="back-link">← Back to Profiles</Link>

      <div className="profile-detail-header">
        <div className="profile-detail-avatar profile-avatar other" style={{ fontSize: "1.6rem" }}>
          👨‍👩‍👧‍👦
        </div>
        <div className="profile-detail-info">
          <h1>{group.name}</h1>
          <div className="meta">
            <span>{group.members.length} members</span>
            <span style={{ textTransform: "capitalize" }}>{group.group_type.replace(/_/g, " ")}</span>
          </div>
        </div>
        <div className="profile-detail-actions">
          <button onClick={() => setActiveTab("chat")} className="btn btn-secondary">💬 Group Chat</button>
          <button onClick={() => setActiveTab("plan")} className="btn btn-primary">🧬 Generate Group Plan</button>
        </div>
      </div>

      <div className="tabs">
        {["overview", "plan", "plans-notifications", "chat"].map((tab) => (
          <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab === "overview" ? "📋 Overview" : tab === "plan" ? "📑 Plan" : tab === "plans-notifications" ? "📊 Plans & Notifications" : "💬 Chat"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="animate-fade-in">
          {/* Conflict Warning */}
          {hasConflicts && (
            <div className="disclaimer" style={{ borderColor: "rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.08)" }}>
              <span className="icon">⚠️</span>
              <div>
                <strong>Potential conflicts detected:</strong> Members have different medical conditions
                {dietaryPrefs.length > 1 && " and dietary preferences"}.
                The AI will automatically flag these when generating plans and suggest per-member modifications.
              </div>
            </div>
          )}

          {/* Group Goals */}
          {group.group_goals?.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <div className="section-title">🎯 Shared Goals</div>
              <div className="profile-tags">
                {group.group_goals.map((g) => (
                  <span key={g} className="tag tag-goal">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Combined Health Summary */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="section-title">📊 Combined Health Summary</div>
            <div className="health-grid">
              <div className="health-info-card">
                <h3>🚫 All Allergies (Union)</h3>
                <div className="profile-tags" style={{ marginTop: "0.5rem" }}>
                  {allAllergies.length > 0 ? allAllergies.map((a) => (
                    <span key={a} className="tag tag-allergy">{a}</span>
                  )) : <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>None</span>}
                </div>
              </div>
              <div className="health-info-card">
                <h3>⚕️ All Conditions</h3>
                <div className="profile-tags" style={{ marginTop: "0.5rem" }}>
                  {allConditions.length > 0 ? allConditions.map((c) => (
                    <span key={c} className="tag tag-condition">{c}</span>
                  )) : <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>None</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="section-title">👥 Members</div>
          <div className="profiles-grid">
            {group.members.map((member) => (
              <Link key={member.id} href={`/profiles/${member.id}`} style={{ textDecoration: "none" }}>
                <div className="profile-card">
                  <div className="profile-card-header">
                    <div className={`profile-avatar ${member.relationship || "other"}`}>
                      {getRelationIcon(member.relationship)}
                    </div>
                    <div>
                      <div className="profile-card-name">{member.name}</div>
                      <div className="profile-card-relation" style={{ textTransform: "capitalize" }}>{member.relationship}</div>
                    </div>
                  </div>
                  <div className="profile-tags" style={{ marginTop: "0.5rem" }}>
                    {member.medical_conditions?.slice(0, 2).map((c) => (
                      <span key={c} className="tag tag-condition">{c}</span>
                    ))}
                    {member.allergies?.slice(0, 2).map((a) => (
                      <span key={a} className="tag tag-allergy">{a}</span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {activeTab === "plan" && (
        <div className="animate-fade-in">
          <div className="plan-generator">
            <div className="plan-options">
              <h3>Generate Group Plan</h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                AI will create a unified plan for all {group.members.length} members with per-person modifications.
              </p>

              <div style={{ marginBottom: "1rem" }}>
                <div className="form-label" style={{ marginBottom: "0.5rem" }}>Focus Areas</div>
                <div className="focus-areas">
                  {FOCUS_AREAS.map((area) => (
                    <button key={area} className={`focus-chip ${focusAreas.includes(area) ? "active" : ""}`} onClick={() => toggleFocus(area)}>
                      {area}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary btn-full" onClick={generatePlan} disabled={generatingPlan}>
                {generatingPlan ? (<><span className="loading-spinner" /> Generating...</>) : "🧬 Generate Group Plan"}
              </button>

              {planError && (
                <div className="form-error" style={{ marginTop: "0.75rem" }}>{planError}</div>
              )}
            </div>

            <div className="plan-content">
              {generatingPlan ? (
                <div className="empty-state">
                  <span className="loading-spinner lg" />
                  <h3 style={{ marginTop: "1rem" }}>Generating group health plan...</h3>
                  <p>The AI is analyzing {group.members.length} profiles and creating a unified plan with per-member modifications.</p>
                </div>
              ) : activePlan ? (
                <div className="animate-fade-in">
                  <PlanDocument
                    title={activePlan.title}
                    content={activePlan.content}
                    createdAt={activePlan.created_at}
                    modelUsed={activePlan.model_used}
                    focusAreas={activePlan.focus_areas}
                    planId={activePlan.id}
                    previewLabel={activePlan.isTemp ? "Unsaved Preview" : null}
                  />
                  {activePlan.isTemp && (
                    <div style={{ marginTop: "2rem", padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", textAlign: "center" }}>
                      <h3 style={{ marginBottom: "0.5rem" }}>💾 Save this Plan?</h3>
                      <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>This plan is currently a preview. Save it to add it to the Plans & Notifications tab.</p>
                      <button className="btn btn-primary" onClick={savePlan} disabled={savingPlan}>
                        {savingPlan ? "Saving..." : "Save Plan to Group"}
                      </button>
                    </div>
                  )}
                </div>
              ) : plans.length > 0 ? (
                <div className="animate-fade-in">
                  <PlanDocument
                    title={plans[0].title}
                    content={plans[0].content}
                    createdAt={plans[0].created_at}
                    modelUsed={plans[0].model_used}
                    focusAreas={plans[0].focus_areas}
                    planId={plans[0].id}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <div className="icon">📋</div>
                  <h3>No plan yet</h3>
                  <p>Generate a new group plan using the options on the left</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "plans-notifications" && (
        <div className="animate-fade-in">
          <CommunicationsTab
            groupId={group.id}
            entityName={group.name}
            onOpenChatWithPlan={openChatWithPlan}
          />
        </div>
      )}

      {activeTab === "chat" && (
        <div className="animate-fade-in">
          <div className="disclaimer">
            <span className="icon">⚠️</span>
            <div>
              You&apos;re chatting with full context for group <strong>{group.name}</strong>.
              The AI considers all member health data and conflicts. Always verify with a healthcare professional.
            </div>
          </div>

          <div className="health-info-card" style={{ marginBottom: "1rem", padding: "0.85rem" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Chat Plan Context (Optional)</label>
              <select className="form-select" value={selectedChatPlanId} onChange={(e) => setSelectedChatPlanId(e.target.value)}>
                <option value="">Group health data only</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title} ({plan.id.slice(0, 8)}…)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="health-info-card" style={{ marginBottom: "1rem", padding: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>Customize Group Plan From This Chat</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  Turn this conversation into an updated group plan draft, then save it into Plans.
                </div>
              </div>
              <button className="btn btn-secondary" onClick={createPlanFromChat} disabled={chatPlanBusy || !activeSessionId}>
                {chatPlanBusy ? "Creating..." : "Create Plan Draft"}
              </button>
            </div>
            {chatPlanError && <div className="form-error" style={{ marginTop: "0.75rem" }}>{chatPlanError}</div>}
          </div>

          {chatPlanDraft && (
            <div className="health-info-card" style={{ marginBottom: "1rem" }}>
              <PlanDocument
                title={chatPlanDraft.title}
                content={chatPlanDraft.content}
                createdAt={chatPlanDraft.created_at}
                modelUsed={chatPlanDraft.model_used}
                planType={chatPlanDraft.plan_type}
                focusAreas={chatPlanDraft.focus_areas}
                previewLabel="Draft From Chat"
              />
              <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={saveChatPlanDraft} disabled={chatPlanBusy}>
                  {chatPlanBusy ? "Saving..." : "Save To Plans"}
                </button>
                <button className="btn btn-secondary" onClick={() => setChatPlanDraft(null)} disabled={chatPlanBusy}>
                  Discard Draft
                </button>
              </div>
            </div>
          )}

          <div className="chat-wrapper">
            <div className="chat-sidebar">
              <div className="chat-sidebar-header">
                <button className="btn btn-primary btn-full btn-sm" onClick={startNewChat}>
                  ➕ New Chat
                </button>
              </div>
              <div className="chat-session-list">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`chat-session-item ${activeSessionId === s.id ? "active" : ""}`}
                    onClick={() => {
                      setPendingNewChat(false);
                      setActiveSessionId(s.id);
                      if (s.plan_id) setSelectedChatPlanId(s.plan_id);
                    }}
                  >
                    {s.title}
                  </div>
                ))}
              </div>
            </div>

            <div className="chat-container">
              <div className="chat-messages">
                {messages.length === 0 && !streaming && (
                  <div className="chat-empty">
                    <div className="icon">💬</div>
                    <h3>Start a group conversation</h3>
                    <p>Ask about diet, activity, schedules, and conflict-aware health changes for this group.</p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div key={msg.id} className={`chat-message ${msg.role}`}>
                    <div className="chat-message-avatar">
                      {msg.role === "assistant" ? "🤖" : "👤"}
                    </div>
                    <div className="chat-bubble">
                      <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(msg.content) }} />
                    </div>
                  </div>
                ))}

                {streaming && streamedContent && (
                  <div className="chat-message assistant">
                    <div className="chat-message-avatar">🤖</div>
                    <div className="chat-bubble">
                      <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(streamedContent) }} />
                    </div>
                  </div>
                )}

                {streaming && !streamedContent && (
                  <div className="chat-message assistant">
                    <div className="chat-message-avatar">🤖</div>
                    <div className="chat-bubble">
                      <div className="typing-indicator">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="chat-input-area">
                <textarea
                  className="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={`Ask about ${group.name} group health...`}
                  rows={1}
                />
                <button
                  className="chat-send-btn"
                  onClick={sendMessage}
                  disabled={streaming || !chatInput.trim()}
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function simpleMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^[\s]*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^[\s]*\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}
