"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

function ProfileFormModal({
  profile,
  onClose,
  onSave,
}: {
  profile?: Profile;
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
          <h2>{profile ? "Edit Profile" : "Add Family Member"}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(searchParams.get("new") === "true");
  const [editProfile, setEditProfile] = useState<Profile | undefined>();

  const loadProfiles = () => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        setProfiles(Array.isArray(data) ? data : []);
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

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫", other: "👤",
    };
    return icons[rel] || "👤";
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header-actions">
        <div className="page-header">
          <h1>Health Profiles</h1>
          <p>Manage health profiles for you and your family</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditProfile(undefined); setShowModal(true); }}>
          ➕ Add Profile
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><span className="loading-spinner lg" /></div>
      ) : profiles.length === 0 ? (
        <div className="empty-state">
          <div className="icon">👥</div>
          <h3>No profiles yet</h3>
          <p>Create your first health profile to get personalized AI recommendations</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Create First Profile
          </button>
        </div>
      ) : (
        <div className="profiles-grid">
          {profiles.map((profile) => (
            <div key={profile.id} className="profile-card">
              <Link href={`/profiles/${profile.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="profile-card-header">
                  <div className={`profile-avatar ${profile.relationship || "other"}`}>
                    {getRelationIcon(profile.relationship)}
                  </div>
                  <div>
                    <div className="profile-card-name">{profile.name}</div>
                    <div className="profile-card-relation">{profile.relationship}</div>
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
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(profile.id, profile.name)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}

          <div className="add-profile-card" onClick={() => { setEditProfile(undefined); setShowModal(true); }}>
            <span className="icon">➕</span>
            <span>Add Family Member</span>
          </div>
        </div>
      )}

      {showModal && (
        <ProfileFormModal
          profile={editProfile}
          onClose={() => { setShowModal(false); setEditProfile(undefined); }}
          onSave={() => { setShowModal(false); setEditProfile(undefined); loadProfiles(); }}
        />
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
