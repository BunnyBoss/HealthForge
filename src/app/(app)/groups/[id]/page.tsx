"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import CommunicationsTab from "@/components/CommunicationsTab";

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
  content: string;
  model_used: string;
  created_at: string;
  focus_areas: string[];
  isTemp?: boolean;
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
    if (activeTab === "plans") {
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

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫",
      friend: "🤝", colleague: "💼", other: "👤",
    };
    return icons[rel] || "👤";
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
          <Link href="/groups" className="btn btn-primary">Back to Groups</Link>
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
      <Link href="/groups" className="back-link">← Back to Groups</Link>

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
          <button onClick={() => setActiveTab("plans")} className="btn btn-primary">🧬 Generate Group Plan</button>
        </div>
      </div>

      <div className="tabs">
        {["overview", "plan", "plans-notifications"].map((tab) => (
          <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab === "overview" ? "📋 Overview" : tab === "plan" ? "📑 Plan" : "📊 Plans & Notifications"}
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

              {planError && <div className="form-error" style={{ marginTop: "0.75rem" }}>{planError}</div>}

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
                  <h1 style={{ color: "var(--accent-primary)", marginBottom: "0.5rem" }}>{activePlan.title}</h1>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                    Generated on {new Date(activePlan.created_at).toLocaleString()} · Model: {activePlan.model_used}
                    {activePlan.isTemp && <span style={{ color: "var(--accent-primary)", marginLeft: "0.5rem", fontWeight: 600 }}>[Unsaved Preview]</span>}
                  </div>
                  <div className="plan-markdown" dangerouslySetInnerHTML={{ __html: simpleMarkdown(activePlan.content) }} />
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
                  <h1 style={{ color: "var(--accent-primary)", marginBottom: "0.5rem" }}>{plans[0].title}</h1>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                    Generated on {new Date(plans[0].created_at).toLocaleString()} · Model: {plans[0].model_used}
                  </div>
                  <div className="plan-markdown" dangerouslySetInnerHTML={{ __html: simpleMarkdown(plans[0].content) }} />
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
          />
        </div>
      )}
    </div>
  );
}

function simpleMarkdown(text: string): string {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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
  return html;
}
