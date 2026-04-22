"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import PedigreeGraph from "@/components/PedigreeGraph";

interface Profile {
  id: string;
  name: string;
  relationship: string;
  age?: number;
  gender?: string;
  medical_conditions: string[];
  goals: string[];
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "network">("grid");

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        setProfiles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const firstName = session?.user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const getRelationIcon = (rel: string) => {
    const icons: Record<string, string> = {
      self: "🧑", spouse: "💑", child: "👶", parent: "👨‍🦳", sibling: "👫",
      friend: "🤝", colleague: "💼", other: "👤",
    };
    return icons[rel] || "👤";
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="dashboard-greeting">
        <h1>
          {greeting}, <span>{firstName}</span>
        </h1>
        <p>Here&apos;s your family health overview</p>
      </div>

      <div className="disclaimer">
        <span className="icon">⚠️</span>
        <div>
          <strong>Medical Disclaimer:</strong> HealthForge provides AI-generated
          recommendations for informational purposes only. Always consult a
          qualified healthcare professional before making changes to your diet,
          exercise, or medication.
        </div>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="icon">👥</div>
          <div className="value">{profiles.length}</div>
          <div className="label">Health Profiles</div>
        </div>
        <div className="stat-card">
          <div className="icon">🎯</div>
          <div className="value">
            {profiles.reduce((acc, p) => acc + (p.goals?.length || 0), 0)}
          </div>
          <div className="label">Active Goals</div>
        </div>
        <div className="stat-card">
          <div className="icon">⚕️</div>
          <div className="value">
            {profiles.reduce(
              (acc, p) => acc + (p.medical_conditions?.length || 0),
              0
            )}
          </div>
          <div className="label">Conditions Tracked</div>
        </div>
        <div className="stat-card">
          <div className="icon">🤖</div>
          <div className="value">AI</div>
          <div className="label">Powered Plans</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '2rem' }}>
        <div className="section-title" style={{ margin: 0 }}>🌍 Network Overview</div>
        
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button 
            className={`tab ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            style={{ padding: '0.4rem 1rem' }}
          >
            🔲 Grid
          </button>
          <button 
            className={`tab ${viewMode === 'network' ? 'active' : ''}`}
            onClick={() => setViewMode('network')}
            style={{ padding: '0.4rem 1rem' }}
          >
            🕸️ Network
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center">
          <span className="loading-spinner lg" />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="profiles-grid animate-fade-in">
          {profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/profiles/${profile.id}`}
              style={{ textDecoration: "none" }}
            >
              <div className="profile-card">
                <div className="profile-card-header">
                  <div className={`profile-avatar ${profile.relationship || "other"}`}>
                    {getRelationIcon(profile.relationship)}
                  </div>
                  <div>
                    <div className="profile-card-name">{profile.name}</div>
                    <div className="profile-card-relation" style={{ textTransform: 'capitalize' }}>
                      {profile.relationship || "Profile"}
                    </div>
                  </div>
                </div>

                <div className="profile-card-stats">
                  {profile.age && (
                    <div className="profile-stat">
                      <span className="icon">🎂</span> {profile.age} years
                    </div>
                  )}
                  {profile.gender && (
                    <div className="profile-stat">
                      <span className="icon">
                        {profile.gender === "male" ? "♂️" : profile.gender === "female" ? "♀️" : "⚧️"}
                      </span>{" "}
                      {profile.gender}
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
                </div>
              </div>
            </Link>
          ))}

          <Link href="/profiles?new=true" style={{ textDecoration: "none" }}>
            <div className="add-profile-card">
              <span className="icon">➕</span>
              <span>Add Profile</span>
            </div>
          </Link>
        </div>
      ) : (
        <div className="animate-fade-in">
          <PedigreeGraph profiles={profiles} />
        </div>
      )}
    </div>
  );
}
