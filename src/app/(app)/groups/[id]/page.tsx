"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
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

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  plan_id?: string | null;
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

  const discussTempPlan = () => {
    if (!activePlan) return;
    setSelectedChatPlanId(activePlan.id);
    setShowChatContextPicker(true);
    setActiveSessionId(null);
    setMessages([]);
    setChatPlanError("");
    setTimeout(() => {
      document.querySelector('.chat-wrapper')?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Chat Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedChatPlanId, setSelectedChatPlanId] = useState<string>("");
  const [showChatContextPicker, setShowChatContextPicker] = useState(false);
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);
  const [sessionMenuOpenId, setSessionMenuOpenId] = useState<string | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [chatPlanBusy, setChatPlanBusy] = useState(false);
  const [chatPlanError, setChatPlanError] = useState("");

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫",
      friend: "🤝", colleague: "💼", other: "👤",
    };
    return icons[rel] || "👤";
  };

  const refreshSessions = useCallback(() => {
    fetch(`/api/chat/sessions?groupId=${id}&showArchived=${showArchivedSessions}`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [id, showArchivedSessions]);

  useEffect(() => {
    if (activeTab === "plan") {
      fetch(`/api/groups/${id}/plan`)
        .then((r) => r.json())
        .then((data) => setPlans(Array.isArray(data) ? data : []))
        .catch(() => {});
      refreshSessions();
    }
  }, [activeTab, id, refreshSessions]);

  useEffect(() => {
    if (activeTab === "plan") refreshSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedSessions]);

  useEffect(() => {
    if (activeSessionId) {
      fetch(`/api/chat?sessionId=${activeSessionId}`)
        .then((r) => r.json())
        .then((data) => setMessages(Array.isArray(data) ? data : []))
        .catch(() => {});
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session?.plan_id) setSelectedChatPlanId(session.plan_id);
  }, [activeSessionId, sessions]);

  useEffect(() => {
    if (!sessionMenuOpenId) return;
    function handleClick(e: MouseEvent) {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sessionMenuOpenId]);

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setChatPlanError("");
  };

  const openChatWithPlan = (plan: { id: string; title: string }) => {
    setSelectedChatPlanId(plan.id);
    setShowChatContextPicker(true);
    setActiveSessionId(null);
    setMessages([]);
    setChatPlanError("");
    setActiveTab("plan");
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
      const payload: Record<string, unknown> = {
        groupId: id,
        message: userMsg,
        sessionId: activeSessionId,
        planId: selectedChatPlanId || null,
      };

      if (selectedChatPlanId && activePlan?.isTemp && selectedChatPlanId === activePlan.id) {
        payload.unsavedPlanContext = { title: activePlan.title, content: activePlan.content };
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const newSessionId = res.headers.get("X-Session-ID");
      if (newSessionId && newSessionId !== activeSessionId) {
        setActiveSessionId(newSessionId);
        refreshSessions();
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

  const createPlanFromChat = async (sessionId?: string) => {
    const sid = sessionId || activeSessionId;
    if (!sid) {
      setChatPlanError("Start or open a chat session first.");
      return;
    }
    setChatPlanBusy(true);
    setChatPlanError("");
    setSessionMenuOpenId(null);
    try {
      const payload: Record<string, unknown> = {
        groupId: id,
        sessionId: sid,
        planId: selectedChatPlanId || null,
      };

      if (selectedChatPlanId && activePlan?.isTemp && selectedChatPlanId === activePlan.id) {
        payload.unsavedPlanContext = {
          title: activePlan.title,
          content: activePlan.content,
          focus_areas: activePlan.focus_areas,
          plan_type: activePlan.plan_type,
        };
      }

      const res = await fetch("/api/chat/session-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const draft = await res.json();
      if (!res.ok) {
        setChatPlanError(draft.error || "Failed to create plan from chat");
        return;
      }
      
      const saveRes = await fetch(`/api/groups/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType: draft.plan_type || "custom",
          focusAreas: draft.focus_areas || [],
          action: "save",
          content: draft.content,
          title: draft.title,
        }),
      });
      const savedData = await saveRes.json();
      if (!saveRes.ok) {
        setChatPlanError(savedData.error || "Failed to save chat-customized group plan");
        return;
      }
      
      setPlans((prev) => [savedData, ...prev]);
      alert("Plan updated and saved successfully! It is now available in the Plans & Notifications tab.");
    } catch {
      setChatPlanError("Failed to update and save plan from chat.");
    } finally {
      setChatPlanBusy(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    setSessionMenuOpenId(null);
    if (!confirm("Delete this chat session and all its messages?")) return;
    try {
      const res = await fetch(`/api/chat/sessions?sessionId=${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) { setActiveSessionId(null); setMessages([]); }
      }
    } catch {}
  };

  const archiveSession = async (sessionId: string) => {
    setSessionMenuOpenId(null);
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, archived: true }),
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) { setActiveSessionId(null); setMessages([]); }
      }
    } catch {}
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
          <button onClick={() => setActiveTab("plan")} className="btn btn-primary">🧬 Generate Group Plan</button>
        </div>
      </div>

      <div className="tabs">
        {["overview", "plan", "plans-notifications"].map((tab) => (
          <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab === "overview" ? "📋 Overview" : tab === "plan" ? "📑 Plan & Chat" : "📊 Plans & Notifications"}
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
                <div className="animate-fade-in" style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: "0.5rem" }}>
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
                      <h3 style={{ marginBottom: "0.5rem" }}>💾 Save or Refine this Plan?</h3>
                      <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>This plan is currently a preview. Save it, or use the chat below to discuss and refine it before saving.</p>
                      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                        <button className="btn btn-primary" onClick={savePlan} disabled={savingPlan}>
                          {savingPlan ? "Saving..." : "Save Plan to Group"}
                        </button>
                        <button className="btn btn-secondary" onClick={discussTempPlan}>
                          💬 Discuss & Refine
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="icon">📋</div>
                  <h3>Plan Generator</h3>
                  <p>Generate a new group plan using the options on the left. Past plans are available in the Plans & Notifications tab.</p>
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

      {activeTab === "plan" && (
        <div className="animate-fade-in" style={{ marginTop: "1.5rem" }}>
          <div className="section-title" style={{ marginBottom: "0.75rem" }}>💬 Group Chat</div>
          <div className="disclaimer" style={{ marginBottom: "1rem" }}>
            <span className="icon">⚠️</span>
            <div>You&apos;re chatting about the <strong>{group.name}</strong> group. The AI considers all member health data and conflicts. Always verify with a healthcare professional.</div>
          </div>

          {chatPlanError && <div className="form-error" style={{ marginBottom: "0.75rem" }}>{chatPlanError}</div>}



          <div className="chat-wrapper">
            <div className="chat-sidebar">
              <div className="chat-sidebar-header">
                <button className="btn btn-primary btn-full btn-sm" onClick={startNewChat}>➕ New Chat</button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: "0.4rem" }}
                  onClick={() => setShowArchivedSessions((v) => !v)}
                >
                  {showArchivedSessions ? "Hide Archived" : "Show Archived"}
                </button>
              </div>
              <div className="chat-session-list">
                {sessions.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "stretch", position: "relative" }}>
                    <div
                      className={`chat-session-item ${activeSessionId === s.id ? "active" : ""}`}
                      style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => {
                        setActiveSessionId(s.id);
                        setSelectedChatPlanId(s.plan_id || "");
                        setShowChatContextPicker(Boolean(s.plan_id));
                        setSessionMenuOpenId(null);
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{ position: "relative" }}
                      ref={sessionMenuOpenId === s.id ? sessionMenuRef : null}
                    >
                      <button
                        className="session-menu-btn"
                        onClick={(e) => { e.stopPropagation(); setSessionMenuOpenId(sessionMenuOpenId === s.id ? null : s.id); }}
                        title="Session options"
                      >⋮</button>
                      {sessionMenuOpenId === s.id && (
                        <div className="session-menu-dropdown">
                          <button onClick={() => createPlanFromChat(s.id)}>🧬 Generate New Plan</button>
                          <button onClick={() => archiveSession(s.id)}>🗂️ Archive</button>
                          <button className="danger" onClick={() => deleteSession(s.id)}>🗑️ Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <div style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>No chat sessions yet. Start a new chat!</div>
                )}
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
                    <div className="chat-message-avatar">{msg.role === "assistant" ? "🤖" : "👤"}</div>
                    <div className="chat-bubble"><div dangerouslySetInnerHTML={{ __html: simpleMarkdown(msg.content) }} /></div>
                  </div>
                ))}
                {streaming && streamedContent && (
                  <div className="chat-message assistant">
                    <div className="chat-message-avatar">🤖</div>
                    <div className="chat-bubble"><div dangerouslySetInnerHTML={{ __html: simpleMarkdown(streamedContent) }} /></div>
                  </div>
                )}
                {streaming && !streamedContent && (
                  <div className="chat-message assistant">
                    <div className="chat-message-avatar">🤖</div>
                    <div className="chat-bubble"><div className="typing-indicator"><span /><span /><span /></div></div>
                  </div>
                )}
              </div>

              <div className="chat-input-area">
                <div className="chat-context-bar">
                  {selectedChatPlanId ? (
                    <span className="chat-context-chip">
                      <span>{selectedChatPlanId === activePlan?.id ? "[Unsaved] " + activePlan.title : plans.find((plan) => plan.id === selectedChatPlanId)?.title || "Selected plan"} ({selectedChatPlanId.slice(0, 8)}…)</span>
                      <button type="button" onClick={() => { setSelectedChatPlanId(""); setShowChatContextPicker(false); }} aria-label="Remove context">×</button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={() => setShowChatContextPicker((v) => !v)}
                      disabled={plans.length === 0 && !activePlan?.isTemp}
                      title={plans.length === 0 && !activePlan?.isTemp ? "Generate or save a plan first" : ""}>
                      + Add Context
                    </button>
                  )}
                  {showChatContextPicker && (plans.length > 0 || activePlan?.isTemp) && (
                    <select className="form-select chat-context-select" value={selectedChatPlanId}
                      onChange={(e) => { setSelectedChatPlanId(e.target.value); if (!e.target.value) setShowChatContextPicker(false); }}>
                      <option value="">Group health data only</option>
                      {activePlan?.isTemp && (
                        <option value={activePlan.id}>[Unsaved] {activePlan.title} ({activePlan.id.slice(0, 8)}…)</option>
                      )}
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title} ({plan.id.slice(0, 8)}…)</option>)}
                    </select>
                  )}
                  {activeSessionId && messages.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => createPlanFromChat()}
                      disabled={chatPlanBusy}
                      title="Update the plan based on this conversation"
                      style={{ marginLeft: "auto", padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                    >
                      {chatPlanBusy ? "Saving..." : "✨ Update and save plan to group"}
                    </button>
                  )}
                </div>
                <textarea className="chat-input" value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={`Ask about ${group.name} group health...`} rows={1}
                />
                <button className="chat-send-btn" onClick={sendMessage} disabled={streaming || !chatInput.trim()}>➤</button>
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
