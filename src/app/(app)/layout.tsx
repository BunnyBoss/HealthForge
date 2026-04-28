"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (status === "loading") {
    return (
      <div className="loading-center" style={{ height: "100vh" }}>
        <span className="loading-spinner lg" />
      </div>
    );
  }

  if (!session?.user) return null;

  const navItems = [
    { href: "/dashboard", icon: "📊", label: "Dashboard" },
    { href: "/profiles", icon: "👥", label: "Profiles" },
    { href: "/help", icon: "🧭", label: "Help/About" },
    { href: "/settings", icon: "⚙️", label: "Settings" },
  ];

  const initials = session.user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div className="app-layout">
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <h2>⚕️ HealthForge</h2>
          <span>AI Health Companion</span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Menu</div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${
                  pathname === item.href || pathname.startsWith(item.href + "/")
                    ? "active"
                    : ""
                }`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user" onClick={() => signOut({ callbackUrl: "/login" })}>
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="name">{session.user.name}</div>
              <div className="email">{session.user.email}</div>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>🚪</span>
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SessionProvider>
  );
}
