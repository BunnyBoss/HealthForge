"use client";

interface PlanDocumentProps {
  title: string;
  content: string;
  createdAt?: string;
  modelUsed?: string;
  planType?: string;
  focusAreas?: string[];
  planId?: string;
  previewLabel?: string | null;
}

export default function PlanDocument({
  title,
  content,
  createdAt,
  modelUsed,
  planType,
  focusAreas = [],
  planId,
  previewLabel,
}: PlanDocumentProps) {
  return (
    <div className="plan-document">
      <div className="plan-document-header">
        <div>
          <h1>{title}</h1>
          <div className="plan-document-meta">
            {planType && <span>{planType}</span>}
            {createdAt && <span>{new Date(createdAt).toLocaleString()}</span>}
            {modelUsed && <span>{modelUsed}</span>}
            {planId && <span>ID {planId.slice(0, 8)}…</span>}
            {previewLabel && <span className="plan-document-preview">{previewLabel}</span>}
          </div>
        </div>
        {focusAreas.length > 0 && (
          <div className="plan-document-chips">
            {focusAreas.map((area) => (
              <span key={area} className="plan-document-chip">{area}</span>
            ))}
          </div>
        )}
      </div>
      <div className="plan-markdown" dangerouslySetInnerHTML={{ __html: simpleMarkdown(content) }} />
    </div>
  );
}

function simpleMarkdown(text: string): string {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
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

  html = html
    .replace(/(Day\s+\d+[:\s].*?)(<br>|<\/h\d>)/gi, "<div class=\"plan-day-label\">$1</div>$2")
    .replace(/(Important Precautions|Key Notes|Daily Summary)/gi, "<span class=\"plan-callout-label\">$1</span>");

  return html;
}
