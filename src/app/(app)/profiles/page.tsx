"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { COUNTRY_OPTIONS, normalizeCountryIso, type CountryIso } from "@/lib/phone";
import PedigreeGraph from "@/components/PedigreeGraph";

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
  phone_number?: string | null;
  is_archived?: number;
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

interface GroupDetail {
  id: string;
  name: string;
  description: string;
  group_type: string;
  group_goals: string[];
  members: { id: string; name: string }[];
}

const MEDICAL_CONDITIONS = [
  "Diabetes (Type 1)", "Diabetes (Type 2)", "Hypertension", "Heart Disease",
  "Asthma", "PCOS", "Thyroid (Hypo)", "Thyroid (Hyper)", "Arthritis",
  "Obesity", "High Cholesterol", "Anemia", "GERD", "IBS", "Kidney Disease",
  "Liver Disease", "Depression", "Anxiety", "Osteoporosis", "Migraine",
];

const GOALS = [
  "Weight Loss", "Weight Gain", "Muscle Building", "Better Sleep",
  "Stress Reduction", "Heart Health", "Blood Sugar Control", "Joint Health",
  "Immunity Boost", "Digestive Health", "Mental Wellness", "Energy Boost",
  "Flexibility", "Endurance", "Healthy Aging",
];

const ALLERGIES = [
  "Peanuts", "Tree Nuts", "Milk/Dairy", "Eggs", "Wheat/Gluten",
  "Soy", "Fish", "Shellfish", "Sesame", "Sulfa Drugs", "Penicillin",
  "NSAIDs", "Latex", "Pollen", "Dust Mites",
];

const GROUP_TYPES = [
  { value: "family_meal", label: "🍽️ Family Meal Plan" },
  { value: "workout", label: "🏋️ Group Workout" },
  { value: "wellness", label: "🧘 Wellness Challenge" },
  { value: "custom", label: "⚡ Custom" },
];

const GROUP_GOALS = [
  "Weight Management", "Healthy Eating", "Active Lifestyle", "Better Sleep",
  "Stress Reduction", "Heart Health", "Family Fitness", "Meal Prep Together",
  "Sugar Control", "Joint Health", "Energy Boost", "Immunity Building",
];

function ProfileFormModal({
  profile,
  defaultCountryIso,
  createTab,
  onSwitchToGroup,
  onClose,
  onSave,
}: {
  profile?: Profile;
  defaultCountryIso: CountryIso;
  createTab?: "profile" | "group";
  onSwitchToGroup?: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: profile?.name || "",
    relationship: profile?.relationship || "other",
    age: profile?.age || "",
    gender: profile?.gender || "",
    height_cm: profile?.height_cm || "",
    weight_kg: profile?.weight_kg || "",
    activity_level: profile?.activity_level || "moderate",
    dietary_preference: profile?.dietary_preference || "no_preference",
    medical_conditions: profile?.medical_conditions || [],
    allergies: profile?.allergies || [],
    medications: profile?.medications || [],
    goals: profile?.goals || [],
    additional_notes: profile?.additional_notes || "",
    phone_number: profile?.phone_number || "",
    phone_country_iso: defaultCountryIso,
  });
  const [medInput, setMedInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleArrayItem = (
    field: "medical_conditions" | "allergies" | "goals",
    item: string
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter((i) => i !== item)
        : [...prev[field], item],
    }));
  };

  const addMedication = () => {
    if (medInput.trim() && !form.medications.includes(medInput.trim())) {
      setForm((prev) => ({
        ...prev,
        medications: [...prev.medications, medInput.trim()],
      }));
      setMedInput("");
    }
  };

  const removeMedication = (med: string) => {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.filter((m) => m !== med),
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const url = profile ? `/api/profiles/${profile.id}` : "/api/profiles";
      const method = profile ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          age: form.age ? Number(form.age) : null,
          height_cm: form.height_cm ? Number(form.height_cm) : null,
          weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      onSave();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{profile ? "Edit Profile" : "Add Profile"}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {!profile && (
          <div style={{ display: "flex", gap: "0.5rem", padding: "0 1.5rem 1rem", flexWrap: "wrap" }}>
            <button type="button" className={`btn ${createTab !== "group" ? "btn-primary" : "btn-secondary"}`}>Add Profile</button>
            <button type="button" className={`btn ${createTab === "group" ? "btn-primary" : "btn-secondary"}`} onClick={onSwitchToGroup}>
              Add Group
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input
                    className="form-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Relationship</label>
                  <select
                    className="form-select"
                    value={form.relationship}
                    onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                  >
                    <option value="self">Self</option>
                    <option value="spouse">Spouse</option>
                    <option value="child">Child</option>
                    <option value="parent">Parent</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                    <option value="colleague">Colleague</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    placeholder="e.g. 35"
                    min="0"
                    max="150"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select
                    className="form-select"
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Height (cm)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.height_cm}
                    onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                    placeholder="e.g. 170"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Weight (kg)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                    placeholder="e.g. 70"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone Country</label>
                  <select
                    className="form-select"
                    value={form.phone_country_iso}
                    onChange={(e) => setForm({ ...form, phone_country_iso: normalizeCountryIso(e.target.value) })}
                  >
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country.iso} value={country.iso}>{country.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Number (Optional)</label>
                  <input
                    className="form-input"
                    value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                    placeholder="e.g. 9876543210 or +919876543210"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Activity Level</label>
                  <select
                    className="form-select"
                    value={form.activity_level}
                    onChange={(e) => setForm({ ...form, activity_level: e.target.value })}
                  >
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                    <option value="very_active">Very Active</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Dietary Preference</label>
                  <select
                    className="form-select"
                    value={form.dietary_preference}
                    onChange={(e) =>
                      setForm({ ...form, dietary_preference: e.target.value })
                    }
                  >
                    <option value="no_preference">No Preference</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="non_vegetarian">Non-Vegetarian</option>
                    <option value="pescatarian">Pescatarian</option>
                    <option value="keto">Keto</option>
                    <option value="paleo">Paleo</option>
                    <option value="mediterranean">Mediterranean</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Medical Conditions</label>
                <div className="focus-areas">
                  {MEDICAL_CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`focus-chip ${form.medical_conditions.includes(c) ? "active" : ""
                        }`}
                      onClick={() => toggleArrayItem("medical_conditions", c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Allergies</label>
                <div className="focus-areas">
                  {ALLERGIES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`focus-chip ${form.allergies.includes(a) ? "active" : ""
                        }`}
                      onClick={() => toggleArrayItem("allergies", a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Health Goals</label>
                <div className="focus-areas">
                  {GOALS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`focus-chip ${form.goals.includes(g) ? "active" : ""
                        }`}
                      onClick={() => toggleArrayItem("goals", g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Current Medications</label>
                <div className="tags-input">
                  {form.medications.map((med) => (
                    <span key={med} className="tag-item">
                      {med}
                      <button type="button" onClick={() => removeMedication(med)}>
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={medInput}
                    onChange={(e) => setMedInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMedication();
                      }
                    }}
                    placeholder="Type medication & press Enter"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Additional Notes</label>
                <textarea
                  className="form-textarea"
                  value={form.additional_notes}
                  onChange={(e) =>
                    setForm({ ...form, additional_notes: e.target.value })
                  }
                  placeholder="Any other health information, dietary restrictions, lifestyle notes..."
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="loading-spinner" /> Saving...
                </>
              ) : profile ? (
                "Update Profile"
              ) : (
                "Create Profile"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfilesPageInner() {
  const searchParams = useSearchParams();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(searchParams.get("new") === "true");
  const [editProfile, setEditProfile] = useState<Profile | undefined>();
  const [defaultCountryIso, setDefaultCountryIso] = useState<CountryIso>("IN");
  const [entityFilter, setEntityFilter] = useState<"all" | "profiles" | "groups">("all");
  const [createTab, setCreateTab] = useState<"profile" | "group">("profile");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupType, setGroupType] = useState("custom");
  const [groupGoals, setGroupGoals] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "network">("grid");
  const [showArchivedProfiles, setShowArchivedProfiles] = useState(false);

  const loadProfiles = () => {
    Promise.all([
      fetch("/api/profiles").then((r) => r.json()),
      fetch("/api/groups").then((r) => r.json()).catch(() => []),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({ default_country_iso: "IN" })),
    ])
      .then(([data, groupsData, settings]) => {
        setProfiles(Array.isArray(data) ? data : []);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
        setDefaultCountryIso(normalizeCountryIso(settings.default_country_iso));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}'s profile?`)) return;
    await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    loadProfiles();
  };

  const handleSetArchived = async (profile: Profile, archived: boolean) => {
    const actionLabel = archived ? "archive" : "restore";
    if (!confirm(`Are you sure you want to ${actionLabel} ${profile.name}'s profile?`)) return;
    await fetch(`/api/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: archived }),
    });
    loadProfiles();
  };

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫",
      friend: "🤝", colleague: "💼", other: "👤",
    };
    return icons[rel] || "👤";
  };

  const getGroupIcon = (type: string) => {
    const icons: Record<string, string> = {
      family_meal: "🍽️",
      workout: "🏋️",
      wellness: "🧘",
      custom: "👨‍👩‍👧‍👦",
    };
    return icons[type] || "👨‍👩‍👧‍👦";
  };

  const toggleGoal = (goal: string) => {
    setGroupGoals((prev) => prev.includes(goal) ? prev.filter((item) => item !== goal) : [...prev, goal]);
  };

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const resetGroupForm = () => {
    setGroupName("");
    setGroupDescription("");
    setGroupType("custom");
    setGroupGoals([]);
    setSelectedMembers([]);
    setEditingGroupId(null);
    setGroupError("");
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setGroupError("Group name is required");
      return;
    }
    if (selectedMembers.length < 2) {
      setGroupError("Select at least 2 members");
      return;
    }

    setGroupSaving(true);
    setGroupError("");
    try {
      const isEditing = Boolean(editingGroupId);
      const path = isEditing ? `/api/groups/${editingGroupId}` : "/api/groups";
      const res = await fetch(path, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription,
          group_type: groupType,
          group_goals: groupGoals,
          member_ids: selectedMembers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGroupError(data.error || "Failed to save group");
        return;
      }
      setShowModal(false);
      resetGroupForm();
      loadProfiles();
    } catch {
      setGroupError("Something went wrong");
    } finally {
      setGroupSaving(false);
    }
  };

  const handleEditGroup = async (groupId: string) => {
    setGroupError("");
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      const data = await res.json();
      if (!res.ok) {
        setGroupError(data.error || "Failed to load group");
        return;
      }
      const detail = data as GroupDetail;
      setEditingGroupId(detail.id);
      setGroupName(detail.name || "");
      setGroupDescription(detail.description || "");
      setGroupType(detail.group_type || "custom");
      setGroupGoals(Array.isArray(detail.group_goals) ? detail.group_goals : []);
      setSelectedMembers(Array.isArray(detail.members) ? detail.members.map((member) => member.id) : []);
      setCreateTab("group");
      setShowModal(true);
    } catch {
      setGroupError("Failed to load group");
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"? Member profiles will remain.`)) return;
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    loadProfiles();
  };

  const visibleProfiles = showArchivedProfiles
    ? profiles
    : profiles.filter((profile) => Number(profile.is_archived || 0) === 0);

  const archivedProfilesCount = profiles.filter((profile) => Number(profile.is_archived || 0) === 1).length;
  const hasAnyEntity = profiles.length > 0 || groups.length > 0;
  const selectableProfiles = profiles.filter((profile) =>
    Number(profile.is_archived || 0) === 0 || selectedMembers.includes(profile.id)
  );

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header-actions">
        <div className="page-header">
          <h1>Profiles</h1>
          <p>Manage individual profiles and shared groups in one place</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditProfile(undefined); setCreateTab("profile"); setShowModal(true); }}>
          ➕ Add Profile / Group
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button className={`btn ${entityFilter === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setEntityFilter("all")}>All</button>
        <button className={`btn ${entityFilter === "profiles" ? "btn-primary" : "btn-secondary"}`} onClick={() => setEntityFilter("profiles")}>Profiles</button>
        <button className={`btn ${entityFilter === "groups" ? "btn-primary" : "btn-secondary"}`} onClick={() => setEntityFilter("groups")}>Groups</button>
        <button
          className={`btn ${showArchivedProfiles ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setShowArchivedProfiles((prev) => !prev)}
        >
          {showArchivedProfiles ? "Hide Archived Profiles" : `Show Archived Profiles${archivedProfilesCount > 0 ? ` (${archivedProfilesCount})` : ""}`}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="section-title" style={{ margin: 0 }}>🌍 View</div>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
          <button
            className={`tab ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => setViewMode("grid")}
            style={{ padding: "0.4rem 1rem" }}
          >
            🔲 Grid
          </button>
          <button
            className={`tab ${viewMode === "network" ? "active" : ""}`}
            onClick={() => setViewMode("network")}
            style={{ padding: "0.4rem 1rem" }}
          >
            🕸️ Network
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><span className="loading-spinner lg" /></div>
      ) : !hasAnyEntity ? (
        <div className="empty-state">
          <div className="icon">👥</div>
          <h3>No profiles or groups yet</h3>
          <p>Create your first profile or group to get personalized AI recommendations</p>
          <button className="btn btn-primary" onClick={() => { setCreateTab("profile"); setShowModal(true); }}>
            Create First Item
          </button>
        </div>
      ) : viewMode === "network" ? (
        <div className="animate-fade-in">
          {visibleProfiles.length > 0 ? (
            <PedigreeGraph profiles={visibleProfiles} />
          ) : (
            <div className="empty-state">
              <div className="icon">🕸️</div>
              <h3>No profiles available for network view</h3>
              <p>{showArchivedProfiles ? "Add at least one profile to use the network graph." : "All profiles are archived. Enable \"Show Archived Profiles\" to include them."}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="profiles-grid">
          {entityFilter !== "groups" && visibleProfiles.map((profile) => (
            <div key={profile.id} className="profile-card">
              <Link href={`/profiles/${profile.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="profile-card-header">
                  <div className={`profile-avatar ${profile.relationship || "other"}`}>
                    {getRelationIcon(profile.relationship)}
                  </div>
                  <div>
                    <div className="profile-card-name">{profile.name}</div>
                    <div className="profile-card-relation">
                      {profile.relationship}
                      {Number(profile.is_archived || 0) === 1 ? " · Archived" : ""}
                    </div>
                  </div>
                </div>

                <div className="profile-card-stats">
                  {profile.age && (
                    <div className="profile-stat"><span className="icon">🎂</span> {profile.age} yrs</div>
                  )}
                  {profile.gender && (
                    <div className="profile-stat">
                      <span className="icon">{profile.gender === "male" ? "♂️" : "♀️"}</span> {profile.gender}
                    </div>
                  )}
                  {profile.phone_number && (
                    <div className="profile-stat"><span className="icon">📱</span> +{profile.phone_number}</div>
                  )}
                </div>

                <div className="profile-tags">
                  {profile.medical_conditions?.slice(0, 3).map((c) => (
                    <span key={c} className="tag tag-condition">{c}</span>
                  ))}
                  {profile.goals?.slice(0, 2).map((g) => (
                    <span key={g} className="tag tag-goal">{g}</span>
                  ))}
                  {profile.allergies?.slice(0, 2).map((a) => (
                    <span key={a} className="tag tag-allergy">{a}</span>
                  ))}
                </div>
              </Link>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => { setEditProfile(profile); setShowModal(true); }}
                >
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSetArchived(profile, Number(profile.is_archived || 0) === 0)}
                  title={Number(profile.is_archived || 0) === 0 ? "Archive profile" : "Restore profile"}
                >
                  {Number(profile.is_archived || 0) === 0 ? "🗂️" : "↩️"}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(profile.id, profile.name)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}

          {entityFilter !== "profiles" && groups.map((group) => (
            <div key={group.id} className="profile-card">
              <Link href={`/groups/${group.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="profile-card-header">
                  <div className="profile-avatar other" style={{ fontSize: "1.4rem" }}>
                    {getGroupIcon(group.group_type)}
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
                  {group.group_goals?.slice(0, 3).map((goal) => (
                    <span key={goal} className="tag tag-goal">{goal}</span>
                  ))}
                </div>
              </Link>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <Link href={`/groups/${group.id}`} className="btn btn-secondary btn-sm" style={{ flex: 1, textDecoration: "none", textAlign: "center" }}>
                  📋 View
                </Link>
                <button className="btn btn-secondary btn-sm" onClick={() => handleEditGroup(group.id)}>
                  ✏️
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGroup(group.id, group.name)}>
                  🗑️
                </button>
              </div>
            </div>
          ))}

          <div className="add-profile-card" onClick={() => { setEditProfile(undefined); setCreateTab("profile"); setShowModal(true); }}>
            <span className="icon">➕</span>
            <span>Add Profile / Group</span>
          </div>
        </div>
      )}

      {showModal && (
        editProfile || createTab === "profile" ? (
          <ProfileFormModal
            profile={editProfile}
            defaultCountryIso={defaultCountryIso}
            createTab={createTab}
            onSwitchToGroup={() => { resetGroupForm(); setCreateTab("group"); }}
            onClose={() => { setShowModal(false); setEditProfile(undefined); }}
            onSave={() => { setShowModal(false); setEditProfile(undefined); loadProfiles(); }}
          />
        ) : (
          <div className="modal-overlay" onClick={() => { setShowModal(false); setEditProfile(undefined); resetGroupForm(); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "760px" }}>
              <div className="modal-header">
                <h2>{editingGroupId ? "Edit Group" : "Add Group"}</h2>
                <button className="modal-close" onClick={() => { setShowModal(false); setEditProfile(undefined); resetGroupForm(); }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", padding: "0 1.5rem 1rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCreateTab("profile")}>Add Profile</button>
                <button type="button" className="btn btn-primary">Add Group</button>
              </div>
              <form onSubmit={handleSaveGroup}>
                <div className="modal-body">
                  {groupError && <div className="form-error" style={{ marginBottom: "1rem" }}>{groupError}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">Group Name *</label>
                      <input className="form-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Family Dinner Plan" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <input className="form-input" value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="Optional description" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Group Type</label>
                      <div className="plan-type-options">
                        {GROUP_TYPES.map((type) => (
                          <button key={type.value} type="button" className={`plan-type-btn ${groupType === type.value ? "active" : ""}`} onClick={() => setGroupType(type.value)}>
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Select Members * (min 2)</label>
                      <div className="focus-areas">
                        {selectableProfiles.map((profile) => (
                          <button key={profile.id} type="button" className={`focus-chip ${selectedMembers.includes(profile.id) ? "active" : ""}`} onClick={() => toggleMember(profile.id)}>
                            {profile.name}{Number(profile.is_archived || 0) === 1 ? " (Archived)" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Shared Goals</label>
                      <div className="focus-areas">
                        {GROUP_GOALS.map((goal) => (
                          <button key={goal} type="button" className={`focus-chip ${groupGoals.includes(goal) ? "active" : ""}`} onClick={() => toggleGoal(goal)}>
                            {goal}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); resetGroupForm(); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={groupSaving}>
                    {groupSaving ? (editingGroupId ? "Saving..." : "Creating...") : (editingGroupId ? "Save Group" : "Create Group")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <Suspense fallback={<div className="loading-center"><span className="loading-spinner lg" /></div>}>
      <ProfilesPageInner />
    </Suspense>
  );
}
