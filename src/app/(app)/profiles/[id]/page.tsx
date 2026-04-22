"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface Profile {
  id: string;
  name: string;
  relationship: string;
  age?: number;
  gender?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: string;
  dietary_preference?: string;
  medical_conditions: string[];
  allergies: string[];
  medications: string[];
  goals: string[];
  additional_notes?: string;
}

interface Plan {
  id: string;
  title: string;
  plan_type: string;
  content: string;
  model_used: string;
  created_at: string;
  focus_areas: string[];
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

const FOCUS_AREAS = [
  "🍽️ Diet & Nutrition",
  "🏋️ Exercise & Fitness",
  "😴 Sleep & Recovery",
  "🧘 Stress Management",
  "💊 Supplements",
  "💧 Hydration",
  "🧠 Mental Wellness",
  "❤️ Heart Health",
];

export default function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planType, setPlanType] = useState("weekly");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState("");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");

  useEffect(() => {
    fetch(`/api/profiles/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setProfile(null);
        } else {
          setProfile(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (activeTab === "plans") {
      fetch(`/api/plans?profileId=${id}`)
        .then((r) => r.json())
        .then((data) => setPlans(Array.isArray(data) ? data : []))
        .catch(() => {});
    } else if (activeTab === "chat") {
      fetch(`/api/chat?profileId=${id}`)
        .then((r) => r.json())
        .then((data) => setMessages(Array.isArray(data) ? data : []))
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
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: id, planType, focusAreas }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Failed to generate plan");
      } else {
        setActivePlan(data);
        setPlans((prev) => [data, ...prev]);
      }
    } catch {
      setPlanError("Failed to connect to AI. Check your LLM settings.");
    } finally {
      setGeneratingPlan(false);
    }
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
        body: JSON.stringify({ profileId: id, message: userMsg }),
      });

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

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-center"><span className="loading-spinner lg" /></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="icon">❌</div>
          <h3>Profile not found</h3>
          <Link href="/profiles" className="btn btn-primary">Back to Profiles</Link>
        </div>
      </div>
    );
  }

  const bmi = profile.height_cm && profile.weight_kg
    ? (profile.weight_kg / ((profile.height_cm / 100) ** 2)).toFixed(1)
    : null;

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫", other: "👤",
    };
    return icons[rel] || "👤";
  };

  return (
    <div className="page-container animate-fade-in">
      <Link href="/profiles" className="back-link">← Back to Profiles</Link>

      <div className="profile-detail-header">
        <div className={`profile-detail-avatar profile-avatar ${profile.relationship || "other"}`}>
          {getRelationIcon(profile.relationship)}
        </div>
        <div className="profile-detail-info">
          <h1>{profile.name}</h1>
          <div className="meta">
            <span style={{ textTransform: "capitalize" }}>{profile.relationship}</span>
            {profile.age && <span>🎂 {profile.age} years</span>}
            {profile.gender && <span>{profile.gender === "male" ? "♂️" : "♀️"} {profile.gender}</span>}
            {bmi && <span>📊 BMI: {bmi}</span>}
          </div>
        </div>
        <div className="profile-detail-actions">
          <Link href={`/profiles/${id}/chat`} className="btn btn-secondary">💬 Chat</Link>
          <Link href={`/profiles/${id}/plan`} className="btn btn-primary">🧬 Generate Plan</Link>
        </div>
      </div>

      <div className="tabs">
        {["overview", "plans", "chat"].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" ? "📋 Overview" : tab === "plans" ? "📑 Plans" : "💬 Chat"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="animate-fade-in">
          <div className="health-grid">
            <div className="health-info-card">
              <h3>📏 Physical Stats</h3>
              <div className="value">
                {profile.height_cm ? `${profile.height_cm} cm` : "—"} ·{" "}
                {profile.weight_kg ? `${profile.weight_kg} kg` : "—"}
                {bmi && ` · BMI ${bmi}`}
              </div>
            </div>
            <div className="health-info-card">
              <h3>🏃 Activity Level</h3>
              <div className="value" style={{ textTransform: "capitalize" }}>
                {profile.activity_level?.replace(/_/g, " ") || "Not specified"}
              </div>
            </div>
            <div className="health-info-card">
              <h3>🥗 Dietary Preference</h3>
              <div className="value" style={{ textTransform: "capitalize" }}>
                {profile.dietary_preference?.replace(/_/g, " ") || "No preference"}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            {profile.medical_conditions?.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div className="section-title">⚕️ Medical Conditions</div>
                <div className="profile-tags">
                  {profile.medical_conditions.map((c) => (
                    <span key={c} className="tag tag-condition">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {profile.allergies?.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div className="section-title">🚫 Allergies</div>
                <div className="profile-tags">
                  {profile.allergies.map((a) => (
                    <span key={a} className="tag tag-allergy">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {profile.medications?.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div className="section-title">💊 Medications</div>
                <div className="profile-tags">
                  {profile.medications.map((m) => (
                    <span key={m} className="tag tag-condition">{m}</span>
                  ))}
                </div>
              </div>
            )}

            {profile.goals?.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div className="section-title">🎯 Health Goals</div>
                <div className="profile-tags">
                  {profile.goals.map((g) => (
                    <span key={g} className="tag tag-goal">{g}</span>
                  ))}
                </div>
              </div>
            )}

            {profile.additional_notes && (
              <div>
                <div className="section-title">📝 Notes</div>
                <div className="health-info-card">
                  <div className="value">{profile.additional_notes}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "plans" && (
        <div className="animate-fade-in">
          <div className="plan-generator">
            <div className="plan-options">
              <h3>Generate New Plan</h3>

              <div style={{ marginBottom: "0.75rem" }}>
                <div className="form-label" style={{ marginBottom: "0.5rem" }}>Plan Type</div>
                <div className="plan-type-options">
                  {["weekly", "monthly", "custom"].map((t) => (
                    <button
                      key={t}
                      className={`plan-type-btn ${planType === t ? "active" : ""}`}
                      onClick={() => setPlanType(t)}
                    >
                      {t === "weekly" ? "📅 Weekly Plan" : t === "monthly" ? "🗓️ Monthly Plan" : "⚡ Custom Plan"}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <div className="form-label" style={{ marginBottom: "0.5rem" }}>Focus Areas</div>
                <div className="focus-areas">
                  {FOCUS_AREAS.map((area) => (
                    <button
                      key={area}
                      className={`focus-chip ${focusAreas.includes(area) ? "active" : ""}`}
                      onClick={() => toggleFocus(area)}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={generatePlan}
                disabled={generatingPlan}
              >
                {generatingPlan ? (
                  <>
                    <span className="loading-spinner" /> Generating...
                  </>
                ) : (
                  "🧬 Generate Plan"
                )}
              </button>

              {planError && (
                <div className="form-error" style={{ marginTop: "0.75rem" }}>{planError}</div>
              )}

              {plans.length > 0 && (
                <div style={{ marginTop: "1.5rem" }}>
                  <div className="form-label" style={{ marginBottom: "0.5rem" }}>Past Plans</div>
                  <div className="plan-list">
                    {plans.map((plan) => (
                      <div
                        key={plan.id}
                        className="plan-list-item"
                        onClick={() => setActivePlan(plan)}
                      >
                        <div>
                          <div className="title">{plan.title}</div>
                          <div className="meta">
                            {new Date(plan.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="plan-content">
              {generatingPlan ? (
                <div className="empty-state">
                  <span className="loading-spinner lg" />
                  <h3 style={{ marginTop: "1rem" }}>Generating your personalized health plan...</h3>
                  <p>This may take a minute. Our AI is crafting detailed, evidence-based recommendations.</p>
                </div>
              ) : activePlan ? (
                <div className="animate-fade-in">
                  <h1 style={{ color: "var(--accent-primary)", marginBottom: "0.5rem" }}>
                    {activePlan.title}
                  </h1>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                    Generated on {new Date(activePlan.created_at).toLocaleString()} · Model: {activePlan.model_used}
                  </div>
                  <div
                    className="plan-markdown"
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(activePlan.content) }}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <div className="icon">📋</div>
                  <h3>No plan selected</h3>
                  <p>Generate a new plan or select a past plan from the sidebar</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "chat" && (
        <div className="animate-fade-in">
          <div className="disclaimer">
            <span className="icon">⚠️</span>
            <div>
              You&apos;re chatting about <strong>{profile.name}</strong>&apos;s health profile.
              The AI has full context of their health data. Always verify with a healthcare professional.
            </div>
          </div>

          <div className="chat-container">
            <div className="chat-messages">
              {messages.length === 0 && !streaming && (
                <div className="chat-empty">
                  <div className="icon">💬</div>
                  <h3>Start a conversation</h3>
                  <p>Ask anything about {profile.name}&apos;s health — diet, exercise, lifestyle, supplements, and more.</p>
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
                placeholder={`Ask about ${profile.name}'s health...`}
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
      )}
    </div>
  );
}

// Simple markdown to HTML converter (no external deps needed for inline rendering)
function simpleMarkdown(text: string): string {
  if (!text) return "";
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")
    // Unordered lists
    .replace(/^[\s]*[-*] (.+)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^[\s]*\d+\. (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Line breaks
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");

  return html;
}
