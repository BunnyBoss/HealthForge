"use client";

import Link from "next/link";

const sections = [
  {
    title: "1. Create profiles and groups",
    points: [
      "Start in Profiles for individual care plans, or Groups for shared household planning.",
      "Profiles store health context like conditions, allergies, goals, notes, and now an optional mobile number.",
      "Groups combine multiple profiles so the AI can generate one coordinated plan with member-specific cautions.",
    ],
  },
  {
    title: "2. Generate focused plans",
    points: [
      "Pick only the focus areas you want before generating a plan.",
      "HealthForge now treats selected focus areas as strict scope, so a hydration request stays hydration-focused instead of drifting into unrelated topics.",
      "You can keep AI-generated plans as previews first, then save the ones you want to use long term.",
    ],
  },
  {
    title: "3. Read plans more easily",
    points: [
      "Saved plans show a metadata header, focus chips, and a cleaner document layout for day sections, lists, and cautions.",
      "The same layout is used in both the main Plan tab and the Plans & Notifications tab for consistency.",
    ],
  },
  {
    title: "4. Queue notifications from plans",
    points: [
      "Open Plans & Notifications, choose a saved plan, and generate a queue directly from it.",
      "The queue generator is AI-driven and can infer the right number of days and reminders, or you can guide it with manual day and frequency inputs.",
      "Each day starts with an early summary message, followed by detailed reminders that keep quantities, timing, and plan references intact.",
    ],
  },
  {
    title: "5. Use chat with plan context",
    points: [
      "From a profile's All Plans table, use Chat to jump directly into the Chat tab with that selected plan already loaded as context.",
      "This is useful when you want follow-up suggestions, substitutions, or clarifications based on one exact plan.",
    ],
  },
  {
    title: "6. Configure WhatsApp and phone defaults",
    points: [
      "Settings stores one default country used to normalize phone numbers across the app.",
      "Your admin phone is used for optional self-CC on queued notifications.",
      "All data stays local in your SQLite database, while AI generation uses your configured LiteLLM or OpenAI-compatible endpoint.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <h1>Help & About</h1>
        <p>Everything a new user needs to understand how HealthForge works.</p>
      </div>

      <div className="disclaimer" style={{ marginBottom: "1.25rem" }}>
        <span className="icon">ℹ️</span>
        <div>
          HealthForge helps organize lifestyle guidance, plans, and reminder queues. It does not replace medical advice, diagnosis, or treatment from a qualified professional.
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        {sections.map((section) => (
          <section key={section.title} className="health-info-card">
            <h2 style={{ marginBottom: "0.75rem" }}>{section.title}</h2>
            <div style={{ display: "grid", gap: "0.6rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {section.points.map((point) => (
                <p key={point} style={{ margin: 0 }}>{point}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="health-info-card" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Quick Start</h2>
        <div style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem", color: "var(--text-secondary)" }}>
          <p style={{ margin: 0 }}>1. Add a profile or group.</p>
          <p style={{ margin: 0 }}>2. Select the focus areas you actually want.</p>
          <p style={{ margin: 0 }}>3. Generate and save the plan.</p>
          <p style={{ margin: 0 }}>4. Open Plans & Notifications to queue reminders.</p>
          <p style={{ margin: 0 }}>5. Use Chat when you want plan-aware follow-up guidance.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/profiles" className="btn btn-primary">Go to Profiles</Link>
          <Link href="/groups" className="btn btn-secondary">Go to Groups</Link>
          <Link href="/settings" className="btn btn-secondary">Open Settings</Link>
        </div>
      </div>
    </div>
  );
}
