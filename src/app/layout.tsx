import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealthForge — AI-Powered Health & Lifestyle Recommendations",
  description:
    "Personalized, science-backed health plans for you and your family. Get AI-driven diet, exercise, and lifestyle recommendations tailored to your unique health profile.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
