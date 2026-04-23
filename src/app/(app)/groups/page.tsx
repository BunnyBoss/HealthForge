"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Profile {
  id: string;
  name: string;
  relationship: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  group_type: string;
  group_goals: string[];
  member_count: number;
  created_at: string;
}

const GROUP_TYPES = [
  { value: "family_meal", label: "🍽️ Family Meal Plan", desc: "Shared meals for the whole family" },
  { value: "workout", label: "🏋️ Group Workout", desc: "Exercise routines for the group" },
  { value: "wellness", label: "🧘 Wellness Challenge", desc: "Holistic wellness program" },
  { value: "custom", label: "⚡ Custom", desc: "Define your own group goals" },
];

const GROUP_GOALS = [
  "Weight Management", "Healthy Eating", "Active Lifestyle", "Better Sleep",
  "Stress Reduction", "Heart Health", "Family Fitness", "Meal Prep Together",
  "Sugar Control", "Joint Health", "Energy Boost", "Immunity Building",
];

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupType, setGroupType] = useState("custom");
  const [groupGoals, setGroupGoals] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/groups").then((r) => r.json()),
      fetch("/api/profiles").then((r) => r.json()),
    ]).then(([g, p]) => {
      setGroups(Array.isArray(g) ? g : []);
      setProfiles(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggleGoal = (goal: string) => {
    setGroupGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Group name is required"); return; }
    if (selectedMembers.length < 2) { setError("Select at least 2 members"); return; }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description,
          group_type: groupType,
          group_goals: groupGoals,
          member_ids: selectedMembers,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create group");
        return;
      }

      // Refresh
      const updatedGroups = await fetch("/api/groups").then((r) => r.json());
      setGroups(Array.isArray(updatedGroups) ? updatedGroups : []);
      setShowModal(false);
      resetForm();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, groupName: string) => {
    if (!confirm(`Delete group "${groupName}"? This won't delete member profiles.`)) return;
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const resetForm = () => {
    setName(""); setDescription(""); setGroupType("custom");
    setGroupGoals([]); setSelectedMembers([]); setError("");
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      family_meal: "🍽️", workout: "🏋️", wellness: "🧘", custom: "⚡",
    };
    return icons[type] || "⚡";
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header-actions">
        <div className="page-header">
          <h1>Groups</h1>
          <p>Create combo profiles for shared health plans</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { resetForm(); setShowModal(true); }}
          disabled={profiles.length < 2}
        >
          ➕ Create Group
        </button>
      </div>

      {profiles.length < 2 && (
        <div className="disclaimer">
          <span className="icon">ℹ️</span>
          <div>You need at least <strong>2 profiles</strong> to create a group. <Link href="/profiles" style={{ color: "var(--accent-primary)" }}>Add profiles first</Link>.</div>
        </div>
      )}

      {loading ? (
        <div className="loading-center"><span className="loading-spinner lg" /></div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="icon">👨‍👩‍👧‍👦</div>
          <h3>No groups yet</h3>
          <p>Create a group to generate shared health plans for multiple people</p>
        </div>
      ) : (
        <div className="profiles-grid">
          {groups.map((group) => (
            <div key={group.id} className="profile-card">
              <Link href={`/groups/${group.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="profile-card-header">
                  <div className="profile-avatar other" style={{ fontSize: "1.4rem" }}>
                    {getTypeIcon(group.group_type)}
                  </div>
                  <div>
                    <div className="profile-card-name">{group.name}</div>
                    <div className="profile-card-relation">{group.member_count} members</div>
                  </div>
                </div>
                {group.description && (
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.5rem 0" }}>
                    {group.description}
                  </div>
                )}
                <div className="profile-tags">
                  {group.group_goals?.slice(0, 3).map((g) => (
                    <span key={g} className="tag tag-goal">{g}</span>
                  ))}
                </div>
              </Link>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <Link href={`/groups/${group.id}`} className="btn btn-secondary btn-sm" style={{ flex: 1, textDecoration: "none", textAlign: "center" }}>
                  📋 View
                </Link>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(group.id, group.name)}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "650px" }}>
            <div className="modal-header">
              <h2>Create Group</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Group Name *</label>
                    <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family Dinner Plan" required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Group Type</label>
                    <div className="plan-type-options">
                      {GROUP_TYPES.map((t) => (
                        <button key={t.value} type="button" className={`plan-type-btn ${groupType === t.value ? "active" : ""}`} onClick={() => setGroupType(t.value)}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Select Members * (min 2)</label>
                    <div className="focus-areas">
                      {profiles.map((p) => (
                        <button key={p.id} type="button" className={`focus-chip ${selectedMembers.includes(p.id) ? "active" : ""}`} onClick={() => toggleMember(p.id)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      {selectedMembers.length} selected
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Shared Goals</label>
                    <div className="focus-areas">
                      {GROUP_GOALS.map((g) => (
                        <button key={g} type="button" className={`focus-chip ${groupGoals.includes(g) ? "active" : ""}`} onClick={() => toggleGoal(g)}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (<><span className="loading-spinner" /> Creating...</>) : "👥 Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
