"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

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

      {loading && (
        <div className="loading-center">
          <span className="loading-spinner lg" />
        </div>
      )}
    </div>
  );
}
