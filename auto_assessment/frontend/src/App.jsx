import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./styles.css";

function Markdown({ children, className = "" }) {
  const text = typeof children === "string" ? children : "";
  if (!text.trim()) return null;
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function OcrEditorField({ label, value, placeholder = "", onChange }) {
  return (
    <label className="ocr-editor-field">
      <span>{label}</span>
      <div className="ocr-editor-column-heads" aria-hidden="true">
        <span>Edit OCR text</span>
        <span>Rendered math preview</span>
      </div>
      <div className="ocr-editor-grid">
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="ocr-rendered-preview">
          {value?.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="ocr-rendered-empty">No text to preview.</p>
          )}
        </div>
      </div>
    </label>
  );
}


const NAV_ITEMS = [
  { id: "upload", label: "Upload", icon: "upload" },
  { id: "results", label: "Score Feed", icon: "score" },
  { id: "chat", label: "Agent Chat", icon: "chat" },
  { id: "history", label: "History", icon: "history" },
  { id: "models", label: "Models", icon: "models" },
];

const AGENT_ICON_MAP = {
  "Transcriber": "transcriber",
  "Solver": "solver",
  "Evaluator": "evaluator",
  "Auditor": "auditor",
  "Regrade Agent": "regrade",
  "Chat Agent": "chat",
};


function Icon({ name, className }) {
  const paths = {
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" />
        <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" />
        <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" />
      </>
    ),
    close: (
  <>
    <line
      x1="18"
      y1="6"
      x2="6"
      y2="18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="6"
      y1="6"
      x2="18"
      y2="18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </>
),
    chevronDown: (
      <>
        <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    chevronUp: (
      <>
        <polyline points="18 15 12 9 6 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.3-3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    language: (
      <>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    moon: (
      <>
        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    score: (
      <>
        <line x1="4" y1="2" x2="4" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="4" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="20" x2="12" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="7.5" y1="20" x2="7.5" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2" />
      </>
    ),
    note: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
    chat: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" />
      </>
    ),
    document: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" />
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" />
        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" />
        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" />
      </>
    ),
    slider: (
    <>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M9 3v18" stroke="currentColor" strokeWidth="2" />
        <path d="M15 15l-3-3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    sliderOpen: (
    <>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M15 3v18" stroke="currentColor" strokeWidth="2" />
        <path d="M9 9l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    models: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    transcriber: (
      <>
        <path d="M4 7V4h3M17 4h3v3M4 17v3h3M20 17v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 12h8M8 9h5M8 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    solver: (
      <>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      </>
    ),
    evaluator: (
      <>
        <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    mic: (
      <>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    auditor: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    regrade: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="11.5" cy="14.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13.3 16.3L16 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    check: (
      <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ),
    cross: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    partial: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    lightbulb: (
      <path
        d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
    alertTriangle: (
      <>
        <path d="M12 3 2 20h20L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
        <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {paths[name] || paths.models}
    </svg>
  );
}

function BrandLogo({ showText = true }) {
  return (
    <span className={`brand-lockup ${showText ? "" : "brand-lockup-icon-only"}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path className="brand-page" d="M10 5h19l8 8v30H10Z" />
          <path className="brand-fold" d="M29 5v8h8Z" />
          <line className="brand-line" x1="15" y1="18" x2="25" y2="18" />
          <line className="brand-line" x1="15" y1="24" x2="25" y2="24" />
          <line className="brand-line" x1="15" y1="30" x2="24" y2="30" />
          <circle className="brand-badge" cx="33" cy="36" r="9" />
          <path className="brand-check" d="M29 36.2 32 39.2 37.5 32.5" />
        </svg>
      </span>
      {showText && <span className="brand-name">AutoAssessment</span>}
    </span>
  );
}

function parseErrorMessage(status, rawDetail) {
  const text = String(rawDetail || "").trim();
  if (status === 429 || /rate.?limit/i.test(text)) {
    return "The grading model has hit its usage limit for now. Please wait a few minutes and try again.";
  }
  const messageMatch = text.match(/'message':\s*'([^']+)'/);
  if (messageMatch) {
    return messageMatch[1];
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    return "Something went wrong while processing your request. Please try again.";
  }
  return text || "An unexpected error occurred.";
}

function getOcrDraftTexts(draft) {
  if (!draft) return [];
  return [
    draft.questionPaper,
    draft.studentAnswer,
    draft.modelAnswer,
    ...(draft.answers || []).map((answer) => answer.student_answer_text),
  ].filter((text) => String(text || "").trim());
}

function getOcrQualityWarnings(draft) {
  const warnings = [];
  const texts = getOcrDraftTexts(draft);
  const joined = texts.join("\n\n");
  if (!joined.trim()) return warnings;

  if (/ocr failed|error code|api error|unauthorized|forbidden|key not allowed/i.test(joined)) {
    warnings.push("OCR contains an API/error message. Re-run OCR or replace that section before grading.");
  }
  if (joined.length < 160) {
    warnings.push("Extraction looks very short. Check that the full question paper and answer sheet were read.");
  }
  if ((joined.match(/\?/g) || []).length >= 8 || /�/.test(joined)) {
    warnings.push("Some characters look uncertain. Review names, numbers, and formulas carefully.");
  }
  const dollarCount = (joined.match(/\$/g) || []).length;
  if (dollarCount % 2 === 1) {
    warnings.push("Math delimiters look unbalanced. Fix any missing $ symbols before grading.");
  }
  const numberedItems = (joined.match(/(^|\n)\s*\d+[\).]/g) || []).length;
  if (numberedItems < 2) {
    warnings.push("Few question numbers were detected. Confirm that questions and answers are separated clearly.");
  }

  return warnings;
}

function getScoreTier(score, max) {
  const safeMax = max || 0;
  if (safeMax <= 0) return "mid";
  const pct = (score || 0) / safeMax;
  if (pct >= 0.8) return "high";
  if (pct >= 0.5) return "mid";
  return "low";
}

// Rendered via <img src="data:image/svg+xml;base64,...">, never inline/dangerouslySetInnerHTML —
// browsers treat an <img>-loaded SVG as a static raster image and never execute anything inside
// it (scripts, event handlers), regardless of what a model-generated SVG string might contain.
function svgToDataUri(svg) {
  if (!svg) return "";
  try {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch {
    return "";
  }
}

const emptyDispute = { disputed_criterion: "", claimed_mistake: "", evidence_quote: "" };


function getSessionId() {
  let id = localStorage.getItem("autoassessment_session_id");

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("autoassessment_session_id", id);
  }

  return id;
}

const SESSION_ID = getSessionId();
const AUTH_STORAGE_KEY = "autoassessment_google_user";
const AUTH_TOKEN_KEY = "autoassessment_session_token";
const THEME_STORAGE_KEY = "autoassessment_theme";
const WORKFLOW_STEPS = [
  { id: "uploading", label: "Uploading", detail: "Securing files" },
  { id: "ocr", label: "Reading work", detail: "Extracting text and math" },
  { id: "answer-key", label: "Answer key", detail: "Building reference solution" },
  { id: "grading", label: "Evaluating", detail: "Checking rubric evidence" },
  { id: "auditing", label: "Auditing", detail: "Validating totals" },
];

function getStoredAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function authHeaders() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatNumber(value, digits = 1) {
  const number = Number(value || 0);
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatScore(score, maxScore) {
  return `${formatNumber(score)} / ${formatNumber(maxScore)}`;
}

function reportToMarkdown(report) {
  if (!report) return "";
  const rows = report.result || report.evaluations || [];
  const lines = [
    "# AutoAssessment Report",
    "",
    `Overall summary: ${report.overall_summary || "No summary provided."}`,
    "",
  ];

  if (report.strengths?.length) {
    lines.push("## Strengths", ...report.strengths.map((item) => `- ${item}`), "");
  }

  if (report.priority_growth_areas?.length) {
    lines.push("## Priority Growth Areas", ...report.priority_growth_areas.map((item) => `- ${item}`), "");
  }

  lines.push("## Question Scores", "");
  rows.forEach((item, index) => {
    lines.push(`### ${item.question_id || `Question ${index + 1}`}`);
    lines.push(`Score: ${formatScore(item.score, item.max_score)}`);
    if (item.concept_tested) lines.push(`Concept: ${item.concept_tested}`);
    if (item.feedback) lines.push("", item.feedback);
    if (item.actionable_takeaway) lines.push("", `Takeaway: ${item.actionable_takeaway}`);
    if (item.criterion_scores?.length) {
      lines.push("", "Criteria:");
      item.criterion_scores.forEach((crit) => {
        lines.push(`- ${crit.description}: ${formatScore(crit.score, crit.weight)}${crit.evidence_quote ? ` | Evidence: "${crit.evidence_quote}"` : ""}`);
      });
    }
    lines.push("");
  });
  return lines.join("\n");
}

function reportToHtml(report, { studentName = "", generatedAt = new Date(), printMode = false } = {}) {
  if (!report) return "";
  const rows = report.result || report.evaluations || [];
  const totalScore = rows.reduce((sum, item) => sum + Number(item?.score || 0), 0);
  const maxScore = rows.reduce((sum, item) => sum + Number(item?.max_score || item?.maxScore || 0), 0);
  const average = maxScore ? formatNumber((totalScore / maxScore) * 10) : "0";
  const generatedLabel = generatedAt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const listSection = (title, items, emptyText) => `
    <section class="report-section">
      <h2>${escapeHtml(title)}</h2>
      ${
        items?.length
          ? `<ul class="clean-list">${items.map((item) => `<li>${richText(item)}</li>`).join("")}</ul>`
          : `<p class="muted">${escapeHtml(emptyText)}</p>`
      }
    </section>
  `;

  const questionSections = rows.map((item, index) => {
    const qid = item?.question_id || `Question ${index + 1}`;
    const itemMax = Number(item?.max_score || 0);
    const itemScore = Number(item?.score || 0);
    const criteria = item?.criterion_scores || [];

    return `
      <article class="question-block">
        <div class="question-header">
          <div>
            <p class="eyebrow">Question ${index + 1}</p>
            <h2>${escapeHtml(qid)}</h2>
            ${item?.concept_tested ? `<p class="concept">${escapeHtml(item.concept_tested)}</p>` : ""}
          </div>
          <div class="question-score">
            <strong>${escapeHtml(formatScore(itemScore, itemMax))}</strong>
          </div>
        </div>

        <div class="feedback-box">
          <h3>Feedback</h3>
          ${richParagraph(item?.feedback)}
        </div>

        ${
          item?.actionable_takeaway
            ? `<div class="takeaway-box"><h3>Next Step</h3>${richParagraph(item.actionable_takeaway)}</div>`
            : ""
        }

        ${
          criteria.length
            ? `
              <table class="criteria-table">
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Evidence</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  ${criteria
                    .map(
                      (crit) => `
                        <tr>
                          <td>${richText(crit.description || "Criterion")}</td>
                          <td>${richText(crit.evidence_quote || crit.feedback || "No specific evidence cited.")}</td>
                          <td>${escapeHtml(formatScore(crit.score, crit.weight))}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            `
            : ""
        }
      </article>
    `;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${printMode ? "" : "AutoAssessment Report"}</title>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
        displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]],
        processEscapes: true
      },
      svg: { fontCache: "global" },
      startup: { typeset: false }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  <style>
    @page { size: A4 portrait; margin: 26mm 24mm; }
    * { box-sizing: border-box; }
    html {
      background: #f4f6f8;
    }
    body {
      margin: 0;
      color: #202124;
      background: #f4f6f8;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 12.5px;
      line-height: 1.55;
    }
    .report-shell {
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      padding: 26mm 24mm;
      background: #ffffff;
      box-shadow: 0 18px 60px rgba(17, 24, 39, 0.12);
      overflow-wrap: anywhere;
    }
    .report-cover {
      border-bottom: 3px solid #f47a55;
      padding: 8px 0 20px;
      margin-bottom: 22px;
    }
    .brand-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      margin-bottom: 26px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: 0;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      display: inline-flex;
      color: #6b7280;
      flex: 0 0 auto;
    }
    .brand-mark svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .brand-page,
    .brand-fold,
    .brand-line {
      stroke: #6b7280;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .brand-page,
    .brand-fold {
      fill: #ffffff;
    }
    .brand-badge {
      fill: #f47a55;
      stroke: #f47a55;
      stroke-width: 2;
    }
    .brand-check {
      stroke: #ffffff;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .meta { text-align: right; color: #6b7280; font-size: 11px; }
    h1 { font-size: 30px; line-height: 1.12; margin: 0 0 10px; letter-spacing: 0; }
    h2 { font-size: 16px; margin: 0 0 10px; letter-spacing: 0; }
    h3 { font-size: 12px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
    p { margin: 0; }
    .subtitle { max-width: 150mm; color: #4b5563; font-size: 13px; }
    .score-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 22px 0 0;
    }
    .score-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px;
      background: #fafafa;
    }
    .score-card span { display: block; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
    .score-card strong { display: block; margin-top: 6px; font-size: 22px; line-height: 1.1; }
    .report-section {
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 16px;
      margin: 14px 0;
      break-inside: avoid;
    }
    .summary-text { color: #374151; font-size: 13.5px; }
    .clean-list { margin: 0; padding-left: 18px; }
    .clean-list li { margin: 5px 0; }
    .muted { color: #6b7280; }
    .question-block {
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      margin: 16px 0;
      padding: 16px;
      break-inside: avoid;
    }
    .question-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 1px solid #edf0f2;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .eyebrow { color: #f47a55; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; font-size: 10px; margin-bottom: 4px; }
    .concept { color: #6b7280; font-weight: 600; }
    .question-score {
      min-width: 90px;
      text-align: right;
      color: #b43d30;
    }
    .question-score strong { display: block; font-size: 18px; }
    .feedback-box, .takeaway-box {
      background: #f8fafc;
      border: 1px solid #edf0f2;
      border-radius: 10px;
      padding: 12px;
      margin-top: 10px;
    }
    .takeaway-box {
      background: #fff3ed;
      border-color: #ffd2c2;
    }
    .criteria-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-top: 14px;
      font-size: 11.5px;
    }
    .criteria-table th {
      text-align: left;
      background: #f3f4f6;
      color: #4b5563;
      padding: 8px;
      border: 1px solid #e5e7eb;
    }
    .criteria-table td {
      vertical-align: top;
      padding: 8px;
      border: 1px solid #e5e7eb;
    }
    mjx-container {
      overflow-x: auto;
      overflow-y: hidden;
      max-width: 100%;
    }
    mjx-container[display="true"] {
      margin: 10px 0;
      text-align: left;
    }
    .footer-note {
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
      margin-top: 24px;
      padding-top: 12px;
      font-size: 10.5px;
    }
    @media print {
      html, body {
        width: auto;
        min-height: auto;
        background: #ffffff;
      }
      body {
        margin: 0;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .report-shell {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      .question-block, .report-section, .score-card { break-inside: avoid; }
    }
    @media screen and (max-width: 900px) {
      .report-shell {
        width: calc(100vw - 32px);
        min-height: auto;
        padding: 36px;
      }
      .score-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <main class="report-shell">
    <section class="report-cover">
      <div class="brand-row">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path class="brand-page" d="M10 5h19l8 8v30H10Z" />
              <path class="brand-fold" d="M29 5v8h8Z" />
              <line class="brand-line" x1="15" y1="18" x2="25" y2="18" />
              <line class="brand-line" x1="15" y1="24" x2="25" y2="24" />
              <line class="brand-line" x1="15" y1="30" x2="24" y2="30" />
              <circle class="brand-badge" cx="33" cy="36" r="9" />
              <path class="brand-check" d="M29 36.2 32 39.2 37.5 32.5" />
            </svg>
          </span>
          <span>AutoAssessment</span>
        </div>
        <div class="meta">
          <div>Generated ${escapeHtml(generatedLabel)}</div>
          ${studentName ? `<div>Student: ${escapeHtml(studentName)}</div>` : ""}
        </div>
      </div>
      <h1>Assessment Feedback Report</h1>
      <p class="subtitle">A readable grading summary for students, teachers, and parents, with scores, evidence, feedback, and next steps for improvement.</p>
      <div class="score-grid">
        <div class="score-card"><span>Overall</span><strong>${escapeHtml(average)} / 10</strong></div>
        <div class="score-card"><span>Total Points</span><strong>${escapeHtml(formatScore(totalScore, maxScore))}</strong></div>
        <div class="score-card"><span>Questions</span><strong>${rows.length}</strong></div>
      </div>
    </section>

    <section class="report-section">
      <h2>Overall Summary</h2>
      <div class="summary-text">${richParagraph(report.overall_summary || "No summary was provided.")}</div>
    </section>

    ${listSection("Strengths", report.strengths, "No strengths were listed.")}
    ${listSection("Priority Growth Areas", report.priority_growth_areas, "No priority growth areas were listed.")}

    <section>
      <h2>Question-by-Question Feedback</h2>
      ${questionSections || `<p class="muted">No question-level evaluations were available.</p>`}
    </section>

    <p class="footer-note">AutoAssessment can make mistakes. Please review important scores, evidence, and feedback before using this report for official records.</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function richText(value) {
  return escapeHtml(value || "No feedback was provided.").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br />");
}

function richParagraph(value, fallback = "No feedback was provided.") {
  return `<p>${richText(value || fallback)}</p>`;
}

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function estimateWorkflowSeconds({ mode, documentCount, answerCount, hasOcrPreview }) {
  const docs = Math.max(1, documentCount);
  const answers = Math.max(1, answerCount);
  if (mode === "ocr") return Math.min(32, 10 + docs * 4 + answers * 3);
  if (hasOcrPreview) return Math.min(40, 14 + answers * 8);
  return Math.min(52, 18 + docs * 5 + answers * 7);
}

function WorkflowProgress({
  activeStage,
  elapsedSeconds = 0,
  estimateSeconds = 60,
  variant = "assessment",
}) {
  if (!activeStage) return null;
  const activeIndex = Math.max(0, WORKFLOW_STEPS.findIndex((step) => step.id === activeStage));
  const activeStep = WORKFLOW_STEPS[activeIndex];
  const stageFloor = (activeIndex / WORKFLOW_STEPS.length) * 100;
  const timeProgress = Math.min(94, (elapsedSeconds / Math.max(estimateSeconds, 1)) * 100);
  const progress = Math.max(4, Math.round(Math.max(stageFloor, timeProgress)));
  const remaining = Math.max(0, estimateSeconds - elapsedSeconds);
  const etaLabel = remaining <= 3 ? "Finishing" : `~${formatElapsed(remaining)}`;
  const title = variant === "ocr" ? "Preparing OCR preview" : "Evaluating assessment";
  return (
    <div className="workflow-progress" aria-live="polite">
      <div className="workflow-header">
        <div>
          <span className="workflow-kicker">Processing</span>
          <h3>{title}</h3>
          <p>
            <span className="workflow-live-dot" aria-hidden="true" />
            {activeStep.label}: {activeStep.detail}
          </p>
        </div>
        <div className="workflow-timer">
          <span>ETA</span>
          <strong>{etaLabel}</strong>
        </div>
      </div>

      <div
        className="workflow-stepper"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label={`${activeStep.label}: ${activeStep.detail}`}
      >
        <div className="workflow-stepper-track">
          <span className="workflow-stepper-track-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="workflow-stepper-items">
          {WORKFLOW_STEPS.map((step, index) => {
            const isDone = index < activeIndex;
            const isActive = index === activeIndex;
            return (
              <div className="workflow-stepper-item" key={step.id}>
                <span
                  className={`workflow-node ${isDone ? "workflow-node-done" : ""} ${
                    isActive ? "workflow-node-active" : ""
                  }`}
                >
                  {isDone ? (
                    <Icon name="check" />
                  ) : isActive ? (
                    <span className="workflow-node-pulse" />
                  ) : (
                    <span className="workflow-node-index">{index + 1}</span>
                  )}
                </span>
                <span
                  className={`workflow-step-label ${isDone ? "workflow-step-done" : ""} ${
                    isActive ? "workflow-step-active" : ""
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


export default function App() {
const [agentModels, setAgentModels] = useState([]);
const [modelsLoading, setModelsLoading] = useState(false);
const [modelsError, setModelsError] = useState("");

const loadPipelineModels = async () => {
  setModelsLoading(true);
  setModelsError("");

  try {
    const res = await fetch("/api/models", {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Failed to load models (${res.status})`);
    }

    const data = await res.json();

    if (!Array.isArray(data.agents)) {
      throw new Error("Invalid model configuration returned by server.");
    }

    setAgentModels(data.agents);
  } catch (err) {
    console.error("Failed to load pipeline models:", err);
    setAgentModels([]);
    setModelsError(
      err.message || "Could not load the active pipeline configuration."
    );
  } finally {
    setModelsLoading(false);
  }
};

// Voice Synthesis & Recognition State
const [isListening, setIsListening] = useState(false);
const [isSpeaking, setIsSpeaking] = useState(false);
const recognitionRef = useRef(null);

// Initialize Web Speech Recognition
useEffect(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setChatInput(transcript);
      }
    };

    recognitionRef.current = recognition;
  }
}, []);

const toggleListening = () => {
  if (!recognitionRef.current) {
    alert("Voice speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
    return;
  }
  if (isListening) {
    recognitionRef.current.stop();
  } else {
    recognitionRef.current.start();
  }
};

const speakText = (text) => {
  if (!window.speechSynthesis) return;
  if (isSpeaking) {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    return;
  }
  const cleanText = text.replace(/[*#_`\[\]()]/g, '');
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.onstart = () => setIsSpeaking(true);
  utterance.onend = () => setIsSpeaking(false);
  utterance.onerror = () => setIsSpeaking(false);
  window.speechSynthesis.speak(utterance);
};

const [speakingIndex, setSpeakingIndex] = useState(null);
const [speechLoadingIndex, setSpeechLoadingIndex] = useState(null);
const [speechError, setSpeechError] = useState(null);
const speechAudioRef = useRef(null);
const speechUrlRef = useRef(null);
const speechSessionRef = useRef(0);

// Split into sentence-sized pieces so we can start playback quickly and
// generate the rest while the first part plays, instead of one long wait
// up front for the whole message.
const SPEECH_CHUNK_MAX = 260;
function splitIntoSpeechChunks(text) {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [];
  const chunks = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > SPEECH_CHUNK_MAX) {
      if (current) { chunks.push(current); current = ""; }
      let rest = sentence;
      while (rest.length > SPEECH_CHUNK_MAX) {
        let cut = rest.lastIndexOf(" ", SPEECH_CHUNK_MAX);
        if (cut <= 0) cut = SPEECH_CHUNK_MAX;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      current = rest;
      continue;
    }
    const merged = current ? `${current} ${sentence}` : sentence;
    if (merged.length > SPEECH_CHUNK_MAX) {
      chunks.push(current);
      current = sentence;
    } else {
      current = merged;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const fetchSpeechChunkUrl = async (text) => {
  const res = await fetch("/api/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) throw new Error("VOICE_AUTH_EXPIRED");
  if (!res.ok) throw new Error("Voice synthesis failed");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

const stopSpeaking = () => {
  speechSessionRef.current += 1;
  speechAudioRef.current?.pause();
  speechAudioRef.current = null;
  if (speechUrlRef.current) {
    URL.revokeObjectURL(speechUrlRef.current);
    speechUrlRef.current = null;
  }
  setSpeakingIndex(null);
  setSpeechLoadingIndex(null);
};

const handleSpeak = (text, index) => {
  if (speakingIndex === index || speechLoadingIndex === index) {
    stopSpeaking();
    return;
  }

  stopSpeaking();
  setSpeechError(null);
  const mySession = speechSessionRef.current;

  const chunks = splitIntoSpeechChunks(text);
  if (chunks.length === 0) return;

  setSpeechLoadingIndex(index);
  let chunkIndex = 0;
  let nextUrlPromise = null;

  const playNext = async () => {
    if (speechSessionRef.current !== mySession) return;
    if (chunkIndex >= chunks.length) {
      stopSpeaking();
      return;
    }

    try {
      const url = await (nextUrlPromise || fetchSpeechChunkUrl(chunks[chunkIndex]));
      if (speechSessionRef.current !== mySession) {
        URL.revokeObjectURL(url);
        return;
      }

      chunkIndex += 1;
      nextUrlPromise = chunkIndex < chunks.length ? fetchSpeechChunkUrl(chunks[chunkIndex]) : null;

      setSpeechLoadingIndex(null);
      setSpeakingIndex(index);

      const audio = new Audio(url);
      speechAudioRef.current = audio;
      speechUrlRef.current = url;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        playNext();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        stopSpeaking();
        setSpeechError({ index, message: "Audio playback failed. Please try again." });
      };
      await audio.play();
    } catch (err) {
      stopSpeaking();
      if (err.message === "VOICE_AUTH_EXPIRED") {
        handleSignOut();
      } else {
        setSpeechError({
          index,
          message: err.message === "Voice synthesis failed"
            ? "Could not generate audio for this response. Please try again."
            : "Could not play audio. Please try again.",
        });
      }
    }
  };

  playNext();
};

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("upload");
  const [rubricFile, setRubricFile] = useState(null);
  const [answerFiles, setAnswerFiles] = useState([]);
  const [modelAnswerFile, setModelAnswerFile] = useState(null);
  const [modelAnswerText, setModelAnswerText] = useState("");
  const [ocrPreview, setOcrPreview] = useState(null);
  const [ocrDraft, setOcrDraft] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [workflowStage, setWorkflowStage] = useState("");
  const [workflowElapsed, setWorkflowElapsed] = useState(0);
  const [systemCheck, setSystemCheck] = useState(null);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [showOptionalUpload, setShowOptionalUpload] = useState(false);
  const [showOcrPreview, setShowOcrPreview] = useState(true);
  const [gradeConfirm, setGradeConfirm] = useState({
    questionPaper: false,
    studentAnswer: false,
    marks: false,
  });
  const [assessmentError, setAssessmentError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState("Copy JSON");
  const [errorMsg, setErrorMsg] = useState("");
  const [response, setResponse] = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [savedOcrPreview, setSavedOcrPreview] = useState(null);
  const [ocrPanelOpen, setOcrPanelOpen] = useState(false);
  const [isBatch, setIsBatch] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [batchErrors, setBatchErrors] = useState(null);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatWindowRef = useRef(null);

  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [regradeOpenFor, setRegradeOpenFor] = useState(null);
  const [dispute, setDispute] = useState(emptyDispute);
  const [regradeLoading, setRegradeLoading] = useState(null);
  const [answerPanelOpenFor, setAnswerPanelOpenFor] = useState(null);
  const [questionPanelOpenFor, setQuestionPanelOpenFor] = useState(null);
  const [diagramPanelOpenFor, setDiagramPanelOpenFor] = useState(null);
  const [regradeNotes, setRegradeNotes] = useState({});
  const [reviewLoading, setReviewLoading] = useState(null);
  const [reviewError, setReviewError] = useState(null);
  const [bulkReviewLoading, setBulkReviewLoading] = useState(false);
  const [expandOverride, setExpandOverride] = useState({});
  const [authUser, setAuthUser] = useState(getStoredAuthUser);
  const [authConfig, setAuthConfig] = useState({ googleClientId: "", allowedDomains: [] });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem(THEME_STORAGE_KEY) || "light"
  );
  const googleButtonRef = useRef(null);
  const profileMenuRef = useRef(null);
  const exportMenuRef = useRef(null);
  const workflowSimulationRef = useRef([]);
  const workflowStartedAtRef = useRef(null);

  const clearWorkflowSimulation = () => {
    workflowSimulationRef.current.forEach((timerId) => window.clearTimeout(timerId));
    workflowSimulationRef.current = [];
    workflowStartedAtRef.current = null;
  };

  const startWorkflowSimulation = (stages, estimateSeconds) => {
    clearWorkflowSimulation();
    if (!stages.length) return;

    workflowStartedAtRef.current = Date.now();
    setWorkflowElapsed(0);
    setWorkflowStage(stages[0]);
    const stepMs = Math.max(1800, Math.floor((estimateSeconds * 1000) / (stages.length + 1)));
    workflowSimulationRef.current = stages.slice(1).map((stage, index) =>
      window.setTimeout(() => {
        setWorkflowStage((current) => (current ? stage : current));
      }, stepMs * (index + 1))
    );
  };

  useEffect(() => {
    if (!workflowStage || (!loading && !ocrLoading)) {
      setWorkflowElapsed(0);
      return;
    }

    const startedAt = workflowStartedAtRef.current || Date.now();
    setWorkflowElapsed(0);
    const timer = window.setInterval(() => {
      setWorkflowElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading, ocrLoading]);

  useEffect(() => () => clearWorkflowSimulation(), []);

  useEffect(() => {
    if (authUser) {
      loadPipelineModels();
      fetch("/api/system/check", {
        headers: authHeaders(),
        credentials: "include",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setSystemCheck(data))
        .catch(() => setSystemCheck(null));
    }
  }, [authUser]);
  const getActiveAssessmentId = () => {
  if (isBatch) {
    return response?.results?.[selectedStudentId]?.assessment_id || null;
  }

  return assessmentId;
};

  useEffect(() => {
    fetch("/api/auth/config")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Could not load Google sign-in configuration.");
        }
        return res.json();
      })
      .then((data) => {
        setAuthConfig({
          googleClientId: data.google_client_id || "",
          allowedDomains: data.allowed_domains || [],
        });
      })
      .catch((err) => {
        setAuthError(err.message || "Could not load Google sign-in.");
      });
  }, []);

  useEffect(() => {
    if (authUser || !authConfig.googleClientId || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;

    const handleCredential = async (response) => {
      if (!response?.credential) return;
      setAuthLoading(true);
      setAuthError("");

      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ credential: response.credential }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || "Google sign-in failed.");
        }

        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
        if (data.token) localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        setAuthUser(data.user);
        setAvatarFailed(false);
      } catch (err) {
        setAuthError(err.message || "Google sign-in failed.");
      } finally {
        setAuthLoading(false);
      }
    };

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: authConfig.googleClientId,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 280,
        text: "signin_with",
      });
    };

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    const script = existingScript || document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () => setAuthError("Could not load Google sign-in. Check your internet connection.");

    if (!existingScript) {
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [authConfig.googleClientId, authUser]);

  const handleSignOut = () => {
    fetch("/api/auth/signout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.google?.accounts?.id?.disableAutoSelect?.();
    setAuthUser(null);
    setAvatarFailed(false);
    setProfileMenuOpen(false);
  };

  useEffect(() => {
    if (!profileMenuOpen) return;

    const handlePointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!exportMenuOpen) return;

    const handlePointerDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setExportMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!answerPanelOpenFor) return;
    document.getElementById(`answer-panel-${answerPanelOpenFor}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [answerPanelOpenFor]);

  useEffect(() => {
    if (!questionPanelOpenFor) return;
    document.getElementById(`question-panel-${questionPanelOpenFor}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [questionPanelOpenFor]);

  useEffect(() => {
    if (!diagramPanelOpenFor) return;
    document.getElementById(`diagram-panel-${diagramPanelOpenFor}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [diagramPanelOpenFor]);

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = themeMode;
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    };

    applyTheme();
  }, [themeMode]);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const res = await fetch(
        "/api/assessments/recent?limit=20",
        {
          headers: {
            "X-Session-ID": SESSION_ID,
            ...authHeaders(),
          },
          credentials: "include",
        }
      );

      if (res.status === 401) {
        handleSignOut();
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        console.error("History error:", data);
        setHistoryError(parseErrorMessage(res.status, data.detail) || "Could not load your saved assessments.");
        return;
      }

      const data = await res.json();
      setHistoryList(data.assessments || []);
    } catch (err) {
      console.error("Failed to load history:", err);
      setHistoryError(err.message || "Could not load your saved assessments.");
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => {
    loadHistory();
  }, []);

  const loadAssessment = async (id) => {
    setErrorMsg("");
    try {
      const res = await fetch(`/api/assessments/${id}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        let rawDetail = "";
        try {
          const body = await res.json();
          rawDetail = body.detail || JSON.stringify(body);
        } catch {
          rawDetail = await res.text();
        }
        throw new Error(rawDetail);
      }
      const data = await res.json();
      setResponse(data);
      setSavedOcrPreview(null);
      setOcrPanelOpen(false);
      setAssessmentId(data.assessment_id || id);
      setIsBatch(false);
      setSelectedStudentId(null);
      setRegradeNotes({});
      setChatMessages([]);
      setActiveTab("results");
    } catch (err) {
      setErrorMsg(err.message || "Failed to load historical assessment.");
    }
  };

  const handleDeleteAssessment = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/assessments/${id}`, {
        method: "DELETE",
        headers: { "X-Session-ID": SESSION_ID, ...authHeaders() },
        credentials: "include",
      });
      if (res.status === 401) {
        handleSignOut();
        return;
      }
      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to delete assessment.");
      }
      setHistoryList((prev) => prev.filter((item) => item.assessment_id !== id));
      if (assessmentId === id) {
        setResponse(null);
        setAssessmentId(null);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to delete assessment.");
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  const saveFile = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const getExportReport = () => {
    if (!isBatch) return response;
    return selectedStudentId && response?.results ? response.results[selectedStudentId] : null;
  };

  const exportMarkdown = () => {
    const report = getExportReport();
    if (!report) {
      setErrorMsg("No report is selected to export.");
      return;
    }
    saveFile("assessment-report.md", reportToMarkdown(report), "text/markdown");
  };

  const exportHtml = ({ print = false } = {}) => {
    const report = getExportReport();
    if (!report) {
      setErrorMsg("No report is selected to export.");
      return;
    }
    const html = reportToHtml(report, {
      studentName: isBatch ? selectedStudentId : "",
      printMode: print,
    });
    if (print) {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-10000px";
      iframe.style.top = "0";
      iframe.style.width = "210mm";
      iframe.style.height = "297mm";
      iframe.style.border = "0";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument || frameWindow?.document;

      if (!frameWindow || !frameDocument) {
        iframe.remove();
        setErrorMsg("Could not open the print dialog. Use Export HTML instead.");
        return;
      }

      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();

      let didPrint = false;
      const printFrame = async () => {
        if (didPrint) return;
        didPrint = true;
        try {
          if (frameWindow.MathJax?.startup?.promise) {
            await frameWindow.MathJax.startup.promise;
          }
          if (frameWindow.MathJax?.typesetPromise) {
            await frameWindow.MathJax.typesetPromise();
          }
        } catch {
          // Print the report even if the optional math renderer cannot load.
        }
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(() => iframe.remove(), 1000);
      };

      iframe.onload = printFrame;
      window.setTimeout(() => {
        if (document.body.contains(iframe)) {
          printFrame();
        }
      }, 250);
      return;
    }
    saveFile("assessment-report.html", html, "text/html");
  };

  const runExportAction = (action) => {
    setExportMenuOpen(false);
    action();
  };

  const handleLoadSavedOcr = async () => {
    const activeId = getActiveAssessmentId();
    if (!activeId) return;
    if (ocrPanelOpen) {
      setOcrPanelOpen(false);
      return;
    }

    try {
      const res = await fetch(`/api/assessments/${activeId}/ocr`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.status === 401) {
        handleSignOut();
        return;
      }
      if (!res.ok) {
        throw new Error("Could not load saved OCR preview.");
      }
      const data = await res.json();
      setSavedOcrPreview(data.ocr_preview || {});
      setOcrPanelOpen(true);
    } catch (err) {
      setErrorMsg(err.message || "Could not load saved OCR preview.");
    }
  };

  const handleCopy = () => {
    const content = JSON.stringify(response, null, 2);
    navigator.clipboard.writeText(content).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy JSON"), 1200);
    });
  };

  const clearOcrPreview = () => {
    setOcrPreview(null);
    setOcrDraft(null);
    setShowOcrPreview(true);
    setGradeConfirm({ questionPaper: false, studentAnswer: false, marks: false });
    setAssessmentError(null);
  };

  const handleAddAnswerFiles = (fileList) => {
    clearOcrPreview();
    const newFiles = Array.from(fileList || []);
    setAnswerFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const merged = [...prev];
      for (const f of newFiles) {
        const key = `${f.name}_${f.size}`;
        if (!existingKeys.has(key)) {
          merged.push(f);
          existingKeys.add(key);
        }
      }
      return merged;
    });
  };

  const removeAnswerFile = (index) => {
    clearOcrPreview();
    setAnswerFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const buildUploadFormData = ({ usePreview = false } = {}) => {
    const useBatch = usePreview && ocrPreview?.mode === "batch"
      ? true
      : answerFiles.length > 1;
    const formData = new FormData();

    if (additionalInstructions.trim()) {
      formData.append("instructions", additionalInstructions.trim());
    }

    if (usePreview && ocrDraft) {
      formData.append("question_paper_text", ocrDraft.questionPaper || "");
      formData.append("rubric_text", ocrDraft.rubric || "");
      formData.append("model_answer_text", ocrDraft.modelAnswer || "");
      formData.append("ocr_preview_json", JSON.stringify(ocrPreview));

      if (useBatch) {
        formData.append(
          "preview_payload",
          JSON.stringify({
            ...ocrPreview,
            question_paper_text: ocrDraft.questionPaper || "",
            rubric_text: ocrDraft.rubric || "",
            model_answer_text: ocrDraft.modelAnswer || "",
            custom_instructions: additionalInstructions.trim(),
            answers: ocrDraft.answers || [],
          })
        );
      } else {
        formData.append("student_answer_text", ocrDraft.studentAnswer || "");
      }

      return { formData, useBatch };
    }

    if (rubricFile) formData.append("rubric_file", rubricFile);
    if (modelAnswerFile) formData.append("model_answer_file", modelAnswerFile);
    if (modelAnswerText.trim()) formData.append("model_answer_text", modelAnswerText.trim());

    if (useBatch) {
      answerFiles.forEach((f) => formData.append("answer_files", f));
      answerFiles.forEach((f) => formData.append("student_ids", f.name));
    } else if (answerFiles.length === 1) {
      formData.append("answer_file", answerFiles[0]);
    }

    return { formData, useBatch };
  };

  const handlePreviewOcr = async () => {
    if (!rubricFile || answerFiles.length === 0) {
      setErrorMsg("Upload a rubric/question paper and at least one answer sheet before previewing OCR.");
      return;
    }

    setErrorMsg("");
    setAssessmentError(null);
    setOcrLoading(true);
    const estimateSeconds = estimateWorkflowSeconds({
      mode: "ocr",
      documentCount: uploadedDocumentCount,
      answerCount: answerFiles.length,
      hasOcrPreview: false,
    });
    startWorkflowSimulation(["uploading", "ocr"], estimateSeconds);

    const { formData } = buildUploadFormData();

    try {
      const res = await fetch("/api/ocr/preview", {
        method: "POST",
        headers: {
          "X-Session-ID": SESSION_ID,
          ...authHeaders(),
        },
        credentials: "include",
        body: formData,
      });

      if (res.status === 401) {
        handleSignOut();
        setErrorMsg("Your session expired. Please sign in again.");
        return;
      }

      if (!res.ok) {
        let rawDetail = "";
        try {
          const errBody = await res.json();
          rawDetail = errBody.detail || JSON.stringify(errBody);
        } catch {
          rawDetail = await res.text();
        }
        setErrorMsg(parseErrorMessage(res.status, rawDetail));
        return;
      }

      const data = await res.json();
      setOcrPreview(data);
      setOcrDraft({
        questionPaper: data.question_paper_text || "",
        rubric: data.rubric_text || "",
        studentAnswer: data.student_answer_text || "",
        modelAnswer: data.model_answer_text || modelAnswerText,
        answers: data.answers || [],
      });
      setShowOcrPreview(true);
      setGradeConfirm({ questionPaper: false, studentAnswer: false, marks: false });
    } catch (err) {
      setErrorMsg(err.message || "OCR preview failed.");
    } finally {
      clearWorkflowSimulation();
      setOcrLoading(false);
      setWorkflowStage("");
    }
  };

  const handleAssess = async () => {
    if (!rubricFile && answerFiles.length === 0) {
      setErrorMsg("Please upload at least an answer sheet or rubric file.");
      return;
    }
    setErrorMsg("");
    setAssessmentError(null);
    setBatchErrors(null);
    setLoading(true);
    const estimateSeconds = estimateWorkflowSeconds({
      mode: "assessment",
      documentCount: uploadedDocumentCount,
      answerCount: answerFiles.length,
      hasOcrPreview: !!ocrDraft,
    });
    startWorkflowSimulation(
      ocrDraft
        ? ["answer-key", "grading", "auditing"]
        : ["uploading", "ocr", "answer-key", "grading", "auditing"],
      estimateSeconds
    );

    const { formData, useBatch } = buildUploadFormData({ usePreview: !!ocrDraft });

    try {
      const res = await fetch(
        useBatch ? "/api/assess/batch" : "/api/assess",
        {
          method: "POST",
          headers: {
            "X-Session-ID": SESSION_ID,
            ...authHeaders(),
          },
          credentials: "include",
          body: formData,
        }
      );

      if (res.status === 401) {
        handleSignOut();
        setErrorMsg("Your session expired. Please sign in again.");
        return;
      }

      if (!res.ok) {
        let rawDetail = "";
        try {
          const errBody = await res.json();
          if (errBody?.detail && typeof errBody.detail === "object") {
            rawDetail = errBody.detail.message || JSON.stringify(errBody.detail);
            if (errBody.detail.errors && Object.keys(errBody.detail.errors).length > 0) {
              setBatchErrors(errBody.detail.errors);
            }
          } else {
            rawDetail = errBody.detail || JSON.stringify(errBody);
          }
        } catch {
          rawDetail = await res.text();
        }
        setErrorMsg(parseErrorMessage(res.status, rawDetail));
        setAssessmentError({
          title: "Evaluation could not finish",
          message: parseErrorMessage(res.status, rawDetail),
          recoverable: !!ocrDraft,
        });
        if (ocrDraft) setShowOcrPreview(true);
        return;
      }

      const data = await res.json();
      setWorkflowStage("auditing");
      setResponse(data);
      setSavedOcrPreview(null);
      setOcrPanelOpen(false);
      setAssessmentId(data.assessment_id || null);
      setIsBatch(useBatch);
      if (useBatch && data.results) {
        const firstId = Object.keys(data.results)[0] || null;
        setSelectedStudentId(firstId);
      } else {
        setSelectedStudentId(null);
      }
      setBatchErrors(useBatch && data.errors && Object.keys(data.errors).length > 0 ? data.errors : null);
      setRegradeNotes({});
      setHasNewResult(true);
      setActiveTab("results");
      loadHistory();
    } catch (err) {
      setErrorMsg(err.message || "An error occurred during assessment.");
      setAssessmentError({
        title: "Evaluation could not finish",
        message: err.message || "An error occurred during assessment.",
        recoverable: !!ocrDraft,
      });
      if (ocrDraft) setShowOcrPreview(true);
    } finally {
      clearWorkflowSimulation();
      setLoading(false);
      setWorkflowStage("");
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          assessment_id: getActiveAssessmentId(),
          messages: updatedMessages,
          hasAssessment: !!response,
        }),
      });

      if (!res.ok) {
        let rawDetail = "";
        try {
          const errBody = await res.json();
          rawDetail = errBody.detail || JSON.stringify(errBody);
        } catch {
          rawDetail = await res.text();
        }
        setChatMessages([
          ...updatedMessages,
          { role: "assistant", content: parseErrorMessage(res.status, rawDetail) },
        ]);
        return;
      }

      const data = await res.json();
      setChatMessages([
        ...updatedMessages,
        { role: "assistant", content: data.answer || "No response received." },
      ]);
    } catch (err) {
      setChatMessages([
        ...updatedMessages,
        { role: "assistant", content: `Chat error: ${err.message || err}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRequestRegrade = async (questionId) => {
    if (!dispute.claimed_mistake.trim() || dispute.claimed_mistake.trim().length < 8) return;
    setRegradeLoading(questionId);

    try {
      const res = await fetch("/api/regrade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          assessment_id: getActiveAssessmentId(),
          question_id: questionId,
          claimed_mistake: dispute.claimed_mistake.trim(),
          disputed_criterion: dispute.disputed_criterion.trim() || null,
          evidence_quote: dispute.evidence_quote.trim() || null,

        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRegradeNotes((prev) => ({
          ...prev,
          [questionId]: { error: parseErrorMessage(res.status, data.detail) },
        }));
        return;
      }

      if (isBatch && selectedStudentId) {
        setResponse((prev) => ({
          ...prev,
          results: { ...prev.results, [selectedStudentId]: data.report },
        }));
      } else {
        setResponse(data.report);
      }

      setRegradeNotes((prev) => ({
        ...prev,
        [questionId]: {
          changed: data.changed,
          claimVerified: data.claim_verified,
          explanation: data.explanation,
        },
      }));
      setRegradeOpenFor(null);
      setDispute(emptyDispute);
      loadHistory();
    } catch (err) {
      setRegradeNotes((prev) => ({
        ...prev,
        [questionId]: { error: err.message || "Re-evaluation failed." },
      }));
    } finally {
      setRegradeLoading(null);
    }
  };

  const handleMarkReviewed = async (questionId) => {
    const noteKey = isBatch && selectedStudentId ? `${selectedStudentId}::${questionId}` : questionId;
    setReviewLoading(noteKey);
    setReviewError(null);
    try {
      const assessmentId = getActiveAssessmentId();
      if (!assessmentId) throw new Error("No assessment is selected to review.");
      const res = await fetch(`/api/assessments/${assessmentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ question_id: questionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(parseErrorMessage(res.status, data.detail));
      }
      if (isBatch && selectedStudentId) {
        setResponse((prev) => ({
          ...prev,
          results: { ...prev.results, [selectedStudentId]: data.report },
        }));
      } else {
        setResponse(data.report);
      }
    } catch (err) {
      setReviewError({ noteKey, message: err.message || "Could not save the review." });
    } finally {
      setReviewLoading(null);
    }
  };

  const handleMarkAllReviewed = async () => {
    setBulkReviewLoading(true);
    try {
      for (const item of questionList) {
        if (item?.question_id && !item.human_reviewed) {
          await handleMarkReviewed(item.question_id);
        }
      }
    } finally {
      setBulkReviewLoading(false);
    }
  };

  const renderStatusIcon = (score, weight) => {
    const tier = getScoreTier(score, weight);
    if (tier === "high") return <span className="rubric-icon tier-high"><Icon name="check" /></span>;
    if (tier === "mid") return <span className="rubric-icon tier-mid"><Icon name="partial" /></span>;
    return <span className="rubric-icon tier-low"><Icon name="cross" /></span>;
  };

  const activeReport = isBatch
    ? response?.results?.[selectedStudentId]
    : response;

  const resultData = activeReport?.result || activeReport?.results || activeReport;
  const questionList = Array.isArray(resultData)
    ? resultData
    : resultData && typeof resultData === "object"
    ? Object.values(resultData)
    : [];

  const pendingReviewCount = questionList.filter((q) => !q?.human_reviewed).length;
  const allQuestionsReviewed = questionList.length > 0 && pendingReviewCount === 0;

  const getMaxScore = (q) => (q?.max_score ?? 10);
  const totalScore = questionList.reduce((sum, q) => sum + (q?.score || 0), 0);
  const maxTotal = questionList.reduce((sum, q) => sum + getMaxScore(q), 0);
  const averageScore = maxTotal ? formatNumber((totalScore / maxTotal) * 10) : null;
  const passCount = questionList.filter((q) => (q?.score || 0) >= getMaxScore(q)).length;
  const overallTier = maxTotal ? getScoreTier(totalScore, maxTotal) : "mid";

  const studentIds = isBatch && response?.results ? Object.keys(response.results) : [];
  const userFullName = authUser?.name || authUser?.email?.split("@")[0] || "Signed in";
  const userDisplayName = userFullName.trim().split(/\s+/)[0];
  const userInitial = (authUser?.name || authUser?.email || "A").slice(0, 1).toUpperCase();
  const uploadedDocumentCount = Math.max(1, answerFiles.length + (rubricFile ? 1 : 0) + (modelAnswerFile ? 1 : 0));
  const workflowEstimateSeconds = estimateWorkflowSeconds({
    mode: ocrLoading ? "ocr" : "assessment",
    documentCount: uploadedDocumentCount,
    answerCount: answerFiles.length,
    hasOcrPreview: !!ocrDraft,
  });
  const ocrQualityWarnings = getOcrQualityWarnings(ocrDraft);
  const isGradeConfirmed = !ocrDraft || (
    gradeConfirm.questionPaper &&
    gradeConfirm.studentAnswer &&
    gradeConfirm.marks
  );
  const looksUngradable =
    response &&
    questionList.length > 0 &&
    totalScore === 0 &&
    maxTotal <= 1 &&
    questionList.every((item) =>
      /ocr|api|missing input|could not|failed|unreadable/i.test(
        `${item?.question_id || ""} ${item?.concept_tested || ""} ${item?.feedback || ""} ${item?.actionable_takeaway || ""}`
      )
    );
  const hasPdfUpload = [rubricFile, modelAnswerFile, ...answerFiles]
    .filter(Boolean)
    .some((file) => file.name?.toLowerCase().endsWith(".pdf"));

  const goToTab = (id) => {
    setActiveTab(id);
    setProfileMenuOpen(false);

    if (id === "results") {
      setHasNewResult(false);
    }

    if (id === "history") {
      loadHistory();
    }

    if (id === "models") {
      loadPipelineModels();
    }
  };

  if (!authUser) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-brand">
            <BrandLogo />
          </div>

          {authConfig.googleClientId ? (
            <div className="google-login-box">
              <div ref={googleButtonRef} className="google-login-button" />
              {authLoading && <p className="auth-note">Signing you in...</p>}
            </div>
          ) : (
            <div className="auth-config-warning">
              <strong>Google sign-in is not configured.</strong>
              <span>Set GOOGLE_CLIENT_ID in your .env file, then restart the app.</span>
            </div>
          )}

          {authError && <p className="error-text">{authError}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <div className="sidebar-brand">
          {sidebarOpen ? (
            <>
              <BrandLogo />
              <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(false)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <Icon name="slider" />
              </button>
            </>
          ) : (
            <button
              className="brand-mark brand-mark-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <span className="brand-mark-face brand-mark-logo">
                <BrandLogo showText={false} />
              </span>
              <span className="brand-mark-face brand-mark-expand">
                <Icon name="sliderOpen" />
              </span>
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? "nav-item-active" : ""}`}
              onClick={() => goToTab(item.id)}
              title={item.label}
              aria-label={item.label}
            >
              <Icon name={item.icon} />
              {sidebarOpen && <span>{item.label}</span>}
              {item.id === "results" && hasNewResult && <span className="nav-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div
            className="status-chip"
            title={response ? "Assessment ready" : "No assessment yet"}
            aria-label={response ? "Assessment ready" : "No assessment yet"}
          >
            <span className={`status-dot ${response ? "status-dot-ready" : ""}`} aria-hidden="true" />
            {sidebarOpen && (response ? "Assessment ready" : "No assessment yet")}
          </div>
        </div>
      </aside>

      <main className={`app-main ${sidebarOpen ? "" : "app-main-sidebar-collapsed"}`}>
        <header className="app-topbar">
          <div className="topbar-actions">
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                className={`profile-pill ${profileMenuOpen ? "profile-pill-open" : ""}`}
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
              >
                {authUser.picture && !avatarFailed ? (
                  <img
                    src={authUser.picture}
                    alt=""
                    className="profile-avatar profile-avatar-image"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <span className="profile-avatar profile-avatar-fallback">{userInitial}</span>
                )}
                <span className="profile-pill-name">{userDisplayName}</span>
                <Icon name={profileMenuOpen ? "chevronUp" : "chevronDown"} />
              </button>

              {profileMenuOpen && (
                <div className="profile-popover" role="menu">
                  <div className="profile-popover-header">
                    {authUser.picture && !avatarFailed ? (
                      <img
                        src={authUser.picture}
                        alt=""
                        className="profile-avatar profile-avatar-large profile-avatar-image"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                      />
                    ) : (
                      <span className="profile-avatar profile-avatar-large profile-avatar-fallback">
                        {userInitial}
                      </span>
                    )}
                    <div className="profile-popover-meta">
                      <strong>{userDisplayName}</strong>
                      <span>{authUser.email}</span>
                    </div>
                  </div>

                  <div className="profile-theme-row" aria-label="Theme">
                    <button
                      className={`profile-theme-option ${themeMode === "light" ? "profile-theme-option-active" : ""}`}
                      type="button"
                      onClick={() => setThemeMode("light")}
                    >
                      <Icon name="sun" />
                      <span>Light</span>
                    </button>
                    <button
                      className={`profile-theme-option ${themeMode === "dark" ? "profile-theme-option-active" : ""}`}
                      type="button"
                      onClick={() => setThemeMode("dark")}
                    >
                      <Icon name="moon" />
                      <span>Dark</span>
                    </button>
                  </div>

                  <button className="profile-menu-item profile-menu-item-danger" type="button" role="menuitem" onClick={handleSignOut}>
                    <Icon name="logout" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeTab === "upload" && (
          <section className="view">
            <header className="view-header">
              <div>
                <p className="view-eyebrow">Step 1 of 3</p>
                <h1>Upload documents</h1>
                <p className="view-subtitle">
                  Attach a rubric or question paper and one or more student answer sheets.
                  Upload multiple answer sheets to grade several students against the same
                  rubric in one batch.
                </p>
              </div>
            </header>

            <div className="upload-grid">
              <div className="dropzone-card">
                <span className="dropzone-label">1. Rubric & Question Paper</span>
                <label className="upload-pill">
                  <span className="upload-icon" aria-hidden="true"><Icon name="document" /></span>
                  <span className="upload-text">
                    {rubricFile ? rubricFile.name : "Attach rubric — PDF, image, or text"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.docx,.txt,.md,.csv"
                    onChange={(e) => {
                      clearOcrPreview();
                      setRubricFile(e.target.files?.[0] || null);
                    }}
                  />
                </label>
                {rubricFile && (
                  <button className="remove-link" onClick={() => setRubricFile(null)}>
                    Remove file
                  </button>
                )}
              </div>

              <div className="dropzone-card">
                <span className="dropzone-label">
                  2. Student's Answer Sheet{answerFiles.length !== 1 ? "s" : ""}
                </span>
                <label className="upload-pill">
                  <span className="upload-icon" aria-hidden="true"><Icon name="note" /></span>
                  <span className="upload-text">
                    {answerFiles.length === 0
                      ? "Attach one or more answer sheets — PDF, image, or text"
                      : `${answerFiles.length} file${answerFiles.length > 1 ? "s" : ""} selected — add more or remove below`}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.docx,.txt"
                    multiple
                    onChange={(e) => {
                      handleAddAnswerFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>

                {answerFiles.length > 0 && (
                  <ul className="file-chip-list">
                    {answerFiles.map((f, idx) => (
                      <li key={`${f.name}_${f.size}_${idx}`} className="file-chip">
                        <span className="file-chip-name">{f.name}</span>
                        <button
                          className="file-chip-remove"
                          onClick={() => removeAnswerFile(idx)}
                          aria-label={`Remove ${f.name}`}
                          title="Remove"
                        >
                          <Icon name="close" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {answerFiles.length > 1 && (
              <p className="batch-hint">
                Batch mode: {answerFiles.length} answer sheets will be graded against the same
                rubric/question paper. The master answer key is generated once and reused for
                every student.
              </p>
            )}

            {hasPdfUpload && systemCheck && !systemCheck.poppler_available && (
              <p className="error-text">
                PDF OCR needs Poppler on this Mac. Install it with: brew install poppler
              </p>
            )}

            <div className="optional-section">
              <button
                type="button"
                className="optional-toggle"
                onClick={() => setShowOptionalUpload((v) => !v)}
                aria-expanded={showOptionalUpload}
              >
                <Icon name={showOptionalUpload ? "chevronUp" : "chevronDown"} />
                <span>{showOptionalUpload ? "Hide optional grading details" : "Add optional grading details"}</span>
                <span className="optional-toggle-hint">Model answer key · Custom instructions</span>
              </button>

              {showOptionalUpload && (
                <div className="optional-body">
                  <div className="field-block">
                    <span className="dropzone-label">Official Model Answer (optional, recommended)</span>
                    <label className="upload-pill">
                      <span className="upload-icon" aria-hidden="true"><Icon name="document" /></span>
                      <span className="upload-text">
                        {modelAnswerFile ? modelAnswerFile.name : "Attach official answer key — PDF, image, or text"}
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf,.docx,.txt"
                        onChange={(e) => {
                          clearOcrPreview();
                          setModelAnswerFile(e.target.files?.[0] || null);
                        }}
                      />
                    </label>
                    {modelAnswerFile && (
                      <button className="remove-link" onClick={() => setModelAnswerFile(null)}>
                        Remove model answer
                      </button>
                    )}
                    <textarea
                      placeholder="Or paste the official model answer here. This skips Gemini answer-key generation and saves cost."
                      value={modelAnswerText}
                      onChange={(e) => setModelAnswerText(e.target.value)}
                    />
                  </div>

                  <div className="field-block">
                    <span className="dropzone-label">Custom grading instructions (optional)</span>
                    <textarea
                      placeholder="e.g., Be lenient on spelling, strictly evaluate math steps..."
                      value={additionalInstructions}
                      onChange={(e) => setAdditionalInstructions(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <WorkflowProgress
              activeStage={workflowStage}
              elapsedSeconds={workflowElapsed}
              estimateSeconds={workflowEstimateSeconds}
              variant={ocrLoading ? "ocr" : "assessment"}
            />

            {ocrDraft && (
              <div className="ocr-review">
                <div className="ocr-review-header">
                  <div>
                    <span className="dropzone-label">OCR preview</span>
                    <h2>Review extracted text before grading</h2>
                    <p className="ocr-review-subtitle">
                      Correct missing words, marks, or math notation here. The edited text below is what grading will use.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ocr-review-toggle"
                    onClick={() => setShowOcrPreview((open) => !open)}
                    aria-expanded={showOcrPreview}
                  >
                    <span>Ready to review</span>
                    <Icon name={showOcrPreview ? "chevronUp" : "chevronDown"} />
                  </button>
                </div>

                {showOcrPreview && (
                  <>
                    <div className="ocr-review-guide">
                      <span>Check question numbers</span>
                      <span>Check marks per question</span>
                      <span>Check formulas and symbols</span>
                    </div>

                    <OcrEditorField
                      label="Question paper / rubric"
                      value={ocrDraft.questionPaper}
                      onChange={(value) =>
                        setOcrDraft((draft) => ({ ...draft, questionPaper: value }))
                      }
                    />

                    {ocrPreview?.mode === "batch" ? (
                      <div className="ocr-answer-stack">
                        {ocrDraft.answers.map((answer, index) => (
                          <OcrEditorField
                            key={`${answer.student_id}_${index}`}
                            label={answer.student_id || answer.filename || `Student ${index + 1}`}
                            value={answer.student_answer_text}
                            onChange={(value) =>
                              setOcrDraft((draft) => ({
                                ...draft,
                                answers: draft.answers.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, student_answer_text: value }
                                    : item
                                ),
                              }))
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <OcrEditorField
                        label="Student answer"
                        value={ocrDraft.studentAnswer}
                        onChange={(value) =>
                          setOcrDraft((draft) => ({ ...draft, studentAnswer: value }))
                        }
                      />
                    )}

                    <OcrEditorField
                      label="Official model answer"
                      value={ocrDraft.modelAnswer}
                      placeholder="Optional"
                      onChange={(value) =>
                        setOcrDraft((draft) => ({ ...draft, modelAnswer: value }))
                      }
                    />

                    <div className="ocr-page-summary">
                      {Object.entries(ocrPreview?.ocr_pages || {}).map(([name, pages]) =>
                        pages?.length ? (
                          <span key={name}>
                            {name.replaceAll("_", " ")}: {pages.filter((page) => !page.error).length}/{pages.length} page OCR
                            {pages.some((page) => page.cached) ? " · cached" : ""}
                          </span>
                        ) : null
                      )}
                      {ocrPreview?.answers?.map((answer) => (
                        <span key={answer.student_id}>
                          {answer.student_id}: {answer.ocr_pages?.filter((page) => !page.error).length || 0}/{answer.ocr_pages?.length || 0} page OCR
                        </span>
                      ))}
                    </div>

                    {ocrQualityWarnings.length > 0 && (
                      <div className="ocr-warning-panel">
                        <strong>Review recommended before grading</strong>
                        <ul>
                          {ocrQualityWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grade-confirm-panel">
                      <div>
                        <strong>Ready to grade?</strong>
                        <span>Confirm the OCR is usable before sending it to the evaluator.</span>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={gradeConfirm.questionPaper}
                          onChange={(event) =>
                            setGradeConfirm((state) => ({ ...state, questionPaper: event.target.checked }))
                          }
                        />
                        Question paper is readable
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={gradeConfirm.studentAnswer}
                          onChange={(event) =>
                            setGradeConfirm((state) => ({ ...state, studentAnswer: event.target.checked }))
                          }
                        />
                        Student answer is readable
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={gradeConfirm.marks}
                          onChange={(event) =>
                            setGradeConfirm((state) => ({ ...state, marks: event.target.checked }))
                          }
                        />
                        Marks and question numbers look correct
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}

            {errorMsg && <p className="error-text">{errorMsg}</p>}

            {batchErrors && Object.keys(batchErrors).length > 0 && (
              <div className="batch-errors-panel">
                <strong>
                  {Object.keys(batchErrors).length} student{Object.keys(batchErrors).length === 1 ? "" : "s"} could not be graded:
                </strong>
                <ul>
                  {Object.entries(batchErrors).map(([studentId, message]) => (
                    <li key={studentId}>
                      <span className="batch-error-student">{studentId}</span>: {message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {assessmentError?.recoverable && (
              <div className="recovery-panel">
                <div>
                  <strong>{assessmentError.title}</strong>
                  <span>Your OCR edits are still here. Fix the text if needed, then retry grading without uploading again.</span>
                </div>
                <div className="recovery-actions">
                  <button className="button button-primary button-sm" onClick={handleAssess} disabled={loading || !isGradeConfirmed}>
                    Retry grading
                  </button>
                  <button className="button button-secondary button-sm" onClick={handlePreviewOcr} disabled={loading || ocrLoading}>
                    Re-run OCR
                  </button>
                </div>
              </div>
            )}

            <div className="actions">
              <button
                className={`button button-secondary button-lg ${ocrLoading ? "button-loading" : ""}`}
                onClick={handlePreviewOcr}
                disabled={ocrLoading || loading || !rubricFile || answerFiles.length === 0}
              >
                <span className="button-loader" aria-hidden="true" />
                <span className="button-text">
                  {ocrLoading ? "Preparing preview..." : ocrDraft ? "Refresh OCR preview" : "Preview OCR"}
                </span>
              </button>
              <button
                className={`button button-primary button-lg ${loading ? "button-loading" : ""}`}
                onClick={handleAssess}
                disabled={loading || ocrLoading || !isGradeConfirmed || (!ocrDraft && (!rubricFile || answerFiles.length === 0))}
              >
                <span className="button-loader" aria-hidden="true" />
                <span className="button-text">
                  {loading
                    ? "Evaluating documents..."
                    : (ocrPreview?.mode === "batch" || answerFiles.length > 1)
                    ? `Start batch assessment (${answerFiles.length})`
                    : "Start assessment"}
                </span>
              </button>
              {response && (
                <button className="button button-ghost" onClick={() => goToTab("results")}>
                  View last result →
                </button>
              )}
            </div>
          </section>
        )}

        {activeTab === "results" && (
          <section className="view">
            <header className="view-header view-header-row">
              <div>
                <p className="view-eyebrow">Step 2 of 3</p>
                <h1>Score feed</h1>
                {questionList.length > 0 && pendingReviewCount > 0 && (
                  <div className="review-gate-hint">
                    <p>
                      {pendingReviewCount} of {questionList.length} question{questionList.length === 1 ? "" : "s"} still
                      need{pendingReviewCount === 1 ? "s" : ""} your review before you can export this report.
                    </p>
                    <button
                      type="button"
                      className="button button-ghost button-sm"
                      disabled={bulkReviewLoading}
                      onClick={handleMarkAllReviewed}
                    >
                      {bulkReviewLoading ? "Marking all reviewed…" : "All look correct — mark all reviewed"}
                    </button>
                  </div>
                )}
              </div>
              <div className="result-actions">
                <div className="export-menu" ref={exportMenuRef}>
                  <button
                    className={`button button-secondary export-trigger ${exportMenuOpen ? "export-trigger-open" : ""}`}
                    onClick={() => setExportMenuOpen((open) => !open)}
                    disabled={!response || !allQuestionsReviewed}
                    title={!allQuestionsReviewed ? "Review every question before exporting" : undefined}
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                  >
                    Export
                    <Icon name={exportMenuOpen ? "chevronUp" : "chevronDown"} />
                  </button>
                  {exportMenuOpen && (
                    <div className="export-popover" role="menu">
                      <button type="button" role="menuitem" onClick={() => runExportAction(() => exportHtml({ print: true }))}>
                        <span>PDF</span>
                        <small>A4 print-ready report</small>
                      </button>
                      <button type="button" role="menuitem" onClick={() => runExportAction(() => exportHtml())}>
                        <span>HTML</span>
                        <small>Shareable web report</small>
                      </button>
                      <button type="button" role="menuitem" onClick={() => runExportAction(exportMarkdown)}>
                        <span>Markdown</span>
                        <small>Readable plain-text format</small>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          runExportAction(() =>
                            saveFile("assessment.json", JSON.stringify(response, null, 2), "application/json")
                          )
                        }
                      >
                        <span>JSON</span>
                        <small>Raw structured data</small>
                      </button>
                      <button type="button" role="menuitem" onClick={() => runExportAction(handleCopy)}>
                        <span>{copyStatus}</span>
                        <small>Copy data to clipboard</small>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="button button-secondary"
                  onClick={handleLoadSavedOcr}
                  disabled={!response}
                >
                  {ocrPanelOpen ? "Hide OCR" : "View OCR"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setIsRawMode(!isRawMode)}
                  disabled={!response}
                >
                  {isRawMode ? "Visual cards" : "Raw JSON"}
                </button>
              </div>
            </header>

            {!response ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true"><Icon name="score" /></div>
                <h3>No assessment yet</h3>
                <p>Upload a rubric and answer sheet to generate your first score feed.</p>
                <button className="button button-primary" onClick={() => goToTab("upload")}>
                  Go to upload
                </button>
              </div>
            ) : (
              <>
                {isBatch && batchErrors && Object.keys(batchErrors).length > 0 && (
                  <div className="batch-errors-panel">
                    <strong>
                      {Object.keys(batchErrors).length} student{Object.keys(batchErrors).length === 1 ? "" : "s"} could not be graded and {Object.keys(batchErrors).length === 1 ? "is" : "are"} not shown below:
                    </strong>
                    <ul>
                      {Object.entries(batchErrors).map(([studentId, message]) => (
                        <li key={studentId}>
                          <span className="batch-error-student">{studentId}</span>: {message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isBatch && studentIds.length > 0 && (
                  <div className="student-tabs">
                    {studentIds.map((id) => (
                      <button
                        key={id}
                        className={`student-tab ${selectedStudentId === id ? "student-tab-active" : ""}`}
                        onClick={() => setSelectedStudentId(id)}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}

                {ocrPanelOpen && (
                  <div className="ocr-review">
                    <div className="ocr-review-header">
                      <div>
                        <span className="dropzone-label">Saved OCR</span>
                        <h2>Per-page extraction</h2>
                        <p className="ocr-review-subtitle">
                          Review the text AutoAssessment used for grading. If exact page OCR was not saved, this shows the final extracted text.
                        </p>
                      </div>
                    </div>
                    {Object.keys(savedOcrPreview || {}).length === 0 ? (
                      <div className="ocr-empty-state">
                        <strong>No saved OCR text is available for this assessment.</strong>
                        <span>Run OCR preview before grading next time to preserve page-level extraction.</span>
                      </div>
                    ) : (
                      <div className="ocr-saved-grid">
                        {Object.entries(savedOcrPreview || {}).map(([section, pages]) => (
                          <div className="ocr-saved-section" key={section}>
                            <span className="dropzone-label">{section.replaceAll("_", " ")}</span>
                            {(pages || []).map((page) => (
                              <details key={`${section}-${page.page}`} className="ocr-page-detail">
                                <summary>
                                  Page {page.page} {page.cached ? "· cached" : ""} {page.error ? "· failed" : ""}
                                </summary>
                                <div className="ocr-page-rendered">
                                  {page.error ? (
                                    <pre>{page.error}</pre>
                                  ) : page.text ? (
                                    <Markdown>{page.text}</Markdown>
                                  ) : (
                                    <p>No text extracted.</p>
                                  )}
                                </div>
                              </details>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!looksUngradable && activeReport?.submission_mismatch_warning && (
                  <div className="no-grade-panel">
                    <div>
                      <span className="dropzone-label">Possible wrong paper</span>
                      <h2>This submission may not match the question paper</h2>
                      <p>{activeReport.submission_mismatch_warning}</p>
                      <p>
                        Every question below has been marked for review as a precaution — please confirm this is the
                        right submission before trusting any of these scores.
                      </p>
                    </div>
                  </div>
                )}

                {looksUngradable && (
                  <div className="no-grade-panel">
                    <div>
                      <span className="dropzone-label">Needs review</span>
                      <h2>This assessment was not graded reliably</h2>
                      <p>
                        The result looks like it came from missing or failed OCR instead of readable student work.
                        Go back to upload, preview OCR, correct the extracted text, and grade again.
                      </p>
                    </div>
                    <button className="button button-primary" onClick={() => goToTab("upload")}>
                      Review OCR and retry
                    </button>
                  </div>
                )}

                {!looksUngradable && (
                <div className="stat-row">
                  <div className={`stat-card stat-card-${overallTier}`}>
                    <span className="stat-label">Average score</span>
                    <span className="stat-value">{averageScore !== null ? averageScore : "—"}<small>/10</small></span>
                  </div>
                  <div className={`stat-card stat-card-${overallTier}`}>
                    <span className="stat-label">Total points</span>
                    <span className="stat-value">{formatNumber(totalScore)}<small>/{formatNumber(maxTotal)}</small></span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Questions graded</span>
                    <span className="stat-value">{questionList.length}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Perfect Scores</span>
                    <span className="stat-value">{passCount}<small>/{questionList.length} questions</small></span>
                  </div>
                </div>
                )}

                {!looksUngradable && activeReport?.student_memory?.length > 0 && (
                  <div className="growth-card growth-priorities">
                    <span className="growth-card-title">Recurring Across Your Past Assessments</span>
                    <ul>
                      {activeReport.student_memory.map((m, mIdx) => (
                        <li key={mIdx}>
                          <strong>{m.concept}</strong> — weak here {m.weak_count} time{m.weak_count === 1 ? "" : "s"} so far.
                          {m.last_note ? ` ${m.last_note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!looksUngradable && (activeReport?.strengths?.length > 0 || activeReport?.priority_growth_areas?.length > 0) ? (
                  <div className="growth-summary-grid">
                    {activeReport.strengths?.length > 0 && (
                      <div className="growth-card growth-strengths">
                        <span className="growth-card-title">Key Strengths Demonstrated</span>
                        <ul>
                          {activeReport.strengths.map((str, sIdx) => (
                            <li key={sIdx}>{str}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeReport.priority_growth_areas?.length > 0 && (
                      <div className="growth-card growth-priorities">
                        <span className="growth-card-title">Priority Focus Areas for Next Test</span>
                        <ul>
                          {activeReport.priority_growth_areas.map((pga, pIdx) => (
                            <li key={pIdx}>{pga}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}

                {isRawMode ? (
                  <pre className="result-json">{JSON.stringify(response, null, 2)}</pre>
                ) : looksUngradable ? null : (
                  <div className="result-cards">
                    {questionList.map((item, idx) => {
                      const qid = item?.question_id ?? `Question ${idx + 1}`;
                      const noteKey = isBatch ? `${selectedStudentId}::${qid}` : qid;
                      const note = regradeNotes[noteKey];
                      const isOpen = regradeOpenFor === noteKey;
                      const isBusy = regradeLoading === noteKey;
                      const canSubmit = dispute.claimed_mistake.trim().length >= 8;
                      const questionScore = item?.score || 0;
                      const questionMax = item?.max_score ?? 10;
                      const scoreTier = getScoreTier(questionScore, questionMax);
                      const isReviewBusy = reviewLoading === noteKey;
                      const reviewIssue = reviewError?.noteKey === noteKey ? reviewError.message : null;
                      const isExpanded = expandOverride[noteKey] ?? !item?.human_reviewed;
                      const toggleExpanded = () =>
                        setExpandOverride((prev) => ({ ...prev, [noteKey]: !isExpanded }));

                      return (
                        <article className={`result-card ${!isExpanded ? "result-card-collapsed" : ""}`} key={qid}>
                          <button type="button" className="card-meta card-meta-toggle" onClick={toggleExpanded}>
                            <div className="card-meta-title">
                              <h3>{item?.question_id || `Question ${idx + 1}`}</h3>
                              {item?.concept_tested && (
                                <span className="concept-tag">{item.concept_tested}</span>
                              )}
                            </div>
                            <div className="card-meta-actions">
                              {item?.human_reviewed ? (
                                <span className="review-badge review-badge-done">
                                  <Icon name="check" /> Reviewed
                                </span>
                              ) : item?.needs_human_review ? (
                                <span className="review-badge review-badge-flagged">Flagged for review</span>
                              ) : null}
                              <span className={`badge-pill badge-pill-${scoreTier}`}>
                                {formatScore(questionScore, questionMax)}
                              </span>
                              <Icon name={isExpanded ? "chevronUp" : "chevronDown"} />
                            </div>
                          </button>

                          {isExpanded && (
                          <>
                          <div className="feedback-panel">
                            <div className="feedback-text">
                              <Markdown>{item?.feedback || "No feedback provided."}</Markdown>
                            </div>
                            {item?.actionable_takeaway && (
                              <div className="feedback-tip">
                                <Icon name="lightbulb" />
                                <Markdown>{item.actionable_takeaway}</Markdown>
                              </div>
                            )}
                            <div className="review-actions">
                              {!item?.human_reviewed && (
                                <button
                                  type="button"
                                  className="button button-primary button-sm"
                                  disabled={isReviewBusy}
                                  onClick={() => handleMarkReviewed(qid)}
                                >
                                  <Icon name="check" /> {isReviewBusy ? "Saving…" : "Looks correct, mark reviewed"}
                                </button>
                              )}
                              {!isOpen && (
                                <button
                                  type="button"
                                  className="button button-secondary button-sm"
                                  onClick={() => {
                                    setRegradeOpenFor(noteKey);
                                    setDispute({
                                      ...emptyDispute,
                                      disputed_criterion: item?.criterion_scores?.[0]?.description || "",
                                    });
                                  }}
                                >
                                  It's wrong — request re-evaluation
                                </button>
                              )}
                            </div>
                            {reviewIssue && <p className="review-edit-error">{reviewIssue}</p>}
                          </div>

                          {item?.criterion_scores?.length > 1 && (
                            <ul className="rubric-list">
                              {item.criterion_scores.map((crit, cIdx) => (
                                <li key={cIdx}>
                                  {renderStatusIcon(crit.score, crit.weight)}
                                  <div className="criterion-content">
                                    <span className="criterion-desc">{crit.description}</span>
                                    {crit.evidence_quote && (
                                      <span className="criterion-quote">
                                        Evidence: "{crit.evidence_quote}"
                                      </span>
                                    )}
                                  </div>
                                  <span className={`rubric-score tier-${getScoreTier(crit.score, crit.weight)}`}>
                                    {formatScore(crit.score, crit.weight)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {(item?.question_text || item?.student_answer || item?.reference_diagram_svg) && (
                            <div className="answer-toggle-row">
                              {item?.question_text && (
                                <button
                                  className="answer-toggle-btn"
                                  onClick={() =>
                                    setQuestionPanelOpenFor(questionPanelOpenFor === noteKey ? null : noteKey)
                                  }
                                >
                                  <Icon name="document" />
                                  {questionPanelOpenFor === noteKey ? "Hide question" : "View question"}
                                  <Icon name={questionPanelOpenFor === noteKey ? "chevronUp" : "chevronDown"} />
                                </button>
                              )}
                              {item?.student_answer && (
                                <button
                                  className="answer-toggle-btn"
                                  onClick={() =>
                                    setAnswerPanelOpenFor(answerPanelOpenFor === noteKey ? null : noteKey)
                                  }
                                >
                                  <Icon name="note" />
                                  {answerPanelOpenFor === noteKey ? "Hide your written answer" : "View your written answer"}
                                  <Icon name={answerPanelOpenFor === noteKey ? "chevronUp" : "chevronDown"} />
                                </button>
                              )}
                              {item?.reference_diagram_svg && (
                                <button
                                  className="answer-toggle-btn"
                                  onClick={() =>
                                    setDiagramPanelOpenFor(diagramPanelOpenFor === noteKey ? null : noteKey)
                                  }
                                >
                                  <Icon name="models" />
                                  {diagramPanelOpenFor === noteKey ? "Hide reference diagram" : "View reference diagram"}
                                  <Icon name={diagramPanelOpenFor === noteKey ? "chevronUp" : "chevronDown"} />
                                </button>
                              )}

                              {questionPanelOpenFor === noteKey && item?.question_text && (
                                <div className="answer-panel" id={`question-panel-${noteKey}`}>
                                  <p className="answer-panel-hint">The question as printed on the paper.</p>
                                  <div className="answer-panel-body">
                                    <Markdown>{item.question_text}</Markdown>
                                  </div>
                                </div>
                              )}

                              {answerPanelOpenFor === noteKey && item?.student_answer && (
                                <div className="answer-panel" id={`answer-panel-${noteKey}`}>
                                  <p className="answer-panel-hint">
                                    Exactly what you wrote for this question, transcribed as-is.
                                  </p>
                                  <div className="answer-panel-body">
                                    <Markdown>{item.student_answer}</Markdown>
                                  </div>
                                </div>
                              )}

                              {diagramPanelOpenFor === noteKey && item?.reference_diagram_svg && (
                                <div className="answer-panel" id={`diagram-panel-${noteKey}`}>
                                  <p className="answer-panel-hint">What a correct diagram for this question looks like.</p>
                                  <div className="answer-panel-body diagram-panel-body">
                                    <img
                                      src={svgToDataUri(item.reference_diagram_svg)}
                                      alt={`Reference diagram for ${item?.question_id || "this question"}`}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {note && !note.error && (
                            <div className={`regrade-note ${note.changed ? "regrade-note-changed" : ""}`}>
                              <strong>
                                {note.claimVerified
                                  ? note.changed ? "Claim verified — score updated: " : "Claim verified: "
                                  : "Claim not verified — score unchanged: "}
                              </strong>
                              {note.explanation}
                            </div>
                          )}
                          {note?.error && <div className="regrade-note regrade-note-error">{note.error}</div>}

                          {isOpen && (
                            <div className="regrade-block">
                              <div className="regrade-form">
                                {item?.criterion_scores?.length > 0 && (
                                  <label className="regrade-field">
                                    <span className="regrade-field-label">Which criterion is disputed? (optional)</span>
                                    <select
                                      className="regrade-select"
                                      value={dispute.disputed_criterion}
                                      onChange={(e) => setDispute((d) => ({ ...d, disputed_criterion: e.target.value }))}
                                    >
                                      <option value="">Whole question — no specific criterion</option>
                                      {item.criterion_scores.map((crit, cIdx) => (
                                        <option key={cIdx} value={crit.description}>{crit.description}</option>
                                      ))}
                                    </select>
                                  </label>
                                )}

                                <label className="regrade-field">
                                  <span className="regrade-field-label">
                                    What did the grader get wrong? <em>(required — be specific)</em>
                                  </span>
                                  <textarea
                                    className="regrade-textarea"
                                    placeholder="e.g. 'You said I didn't show the chain rule, but I did — see my evidence below.'"
                                    value={dispute.claimed_mistake}
                                    onChange={(e) => setDispute((d) => ({ ...d, claimed_mistake: e.target.value }))}
                                  />
                                </label>

                                <label className="regrade-field">
                                  <span className="regrade-field-label">
                                    Quote the exact part of your answer that proves it (recommended)
                                  </span>
                                  <textarea
                                    className="regrade-textarea regrade-textarea-sm"
                                    placeholder="Paste the exact line/step from your submission here..."
                                    value={dispute.evidence_quote}
                                    onChange={(e) => setDispute((d) => ({ ...d, evidence_quote: e.target.value }))}
                                  />
                                </label>

                                <div className="regrade-actions">
                                  <button
                                    className="button button-primary button-sm"
                                    onClick={() => handleRequestRegrade(qid)}
                                    disabled={isBusy || !canSubmit}
                                  >
                                    {isBusy ? "Verifying claim…" : "Submit request"}
                                  </button>
                                  <button
                                    className="button button-muted button-sm"
                                    onClick={() => {
                                      setRegradeOpenFor(null);
                                      setDispute(emptyDispute);
                                    }}
                                    disabled={isBusy}
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {!canSubmit && dispute.claimed_mistake.length > 0 && (
                                  <p className="regrade-hint">Please describe the specific mistake in more detail (min 8 characters).</p>
                                )}
                              </div>
                            </div>
                          )}
                          </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section className="view">
            <header className="view-header view-header-row">
              <div>
                <p className="view-eyebrow">Previous Submissions</p>
                <h1>Assessment History</h1>
              </div>
              <div className="result-actions">
                <button
                  className="button button-secondary"
                  onClick={loadHistory}
                  disabled={historyLoading}
                >
                  {historyLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </header>

            {historyError ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true"><Icon name="alertTriangle" /></div>
                <h3>Couldn't load your history</h3>
                <p>{historyError}</p>
                <button className="button button-primary" onClick={loadHistory} disabled={historyLoading}>
                  {historyLoading ? "Retrying…" : "Try again"}
                </button>
              </div>
            ) : historyList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true"><Icon name="history" /></div>
                <h3>No saved assessments</h3>
                <p>Past evaluated submissions will appear here for review and follow-up.</p>
                <button className="button button-primary" onClick={() => goToTab("upload")}>
                  Start new assessment
                </button>
              </div>
            ) : (
              <div className="result-cards">
                {historyList.map((item) => {
                  const score = Number(item.score || 0);
                  const max = Number(item.max_score || 25);
                  const tier = getScoreTier(score, max);
                  const dateStr = item.created_at ? new Date(item.created_at).toLocaleString() : "";
                  const isCurrent = assessmentId === item.assessment_id;

                  return (
                    <article className="result-card" key={item.assessment_id}>
                      <div className="card-meta">
                        <div>
                          <h3>{item.student_filename || "Assessment"}</h3>
                          <span style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
                            {dateStr}
                          </span>
                        </div>
                        <span className={`badge-pill badge-pill-${tier}`}>
                          {formatScore(score, max)}
                        </span>
                      </div>
                      <div className="feedback-panel">
                        <div className="feedback-text">
                          Question paper: <strong>{item.question_paper_filename || "Uploaded Paper"}</strong>
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          className={`button ${isCurrent ? "button-muted" : "button-primary"} button-sm`}
                          onClick={() => loadAssessment(item.assessment_id)}
                        >
                          {isCurrent ? "Active In View" : "Open Assessment"}
                        </button>
                        {deleteConfirmId === item.assessment_id ? (
                          <>
                            <button
                              className="button button-danger button-sm"
                              onClick={() => handleDeleteAssessment(item.assessment_id)}
                              disabled={deletingId === item.assessment_id}
                            >
                              {deletingId === item.assessment_id ? "Deleting…" : "Confirm delete"}
                            </button>
                            <button
                              className="button button-muted button-sm"
                              onClick={() => setDeleteConfirmId(null)}
                              disabled={deletingId === item.assessment_id}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="button button-danger-link button-sm"
                            onClick={() => setDeleteConfirmId(item.assessment_id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "chat" && (
          <section className="view view-chat">
            <header className="view-header">
              <p className="view-eyebrow">Step 3 of 3</p>
              <h1>Agent chat</h1>
              <p className="view-subtitle">
                Ask follow-up questions about the grading. For an actual score change, use
                "Request re-evaluation" on the question card in Score Feed and name the
                specific mistake — this chat cannot change scores.
              </p>
            </header>

            <div className="chat-shell">
              <div className="chat-window" ref={chatWindowRef}>
                {chatMessages.length === 0 ? (
                  <div className="chat-empty">
                    <p className="chat-empty-heading">What would you like to know?</p>
                    <div className="chat-suggestions">
                      <button onClick={() => setChatInput("Why did Q1 lose points?")}>Why did Q1 lose points?</button>
                      <button onClick={() => setChatInput("Summarize the overall performance.")}>Summarize overall performance</button>
                      <button onClick={() => setChatInput("Which question had the weakest answer?")}>Which question was weakest?</button>
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`chat-message ${msg.role === "user" ? "chat-user" : "chat-agent"}`}
                    >
                      <div className="chat-bubble">
                        <div className="chat-bubble-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="chat-role">{msg.role === "user" ? "You" : "Agent"}</span>
                          {msg.role !== "user" && (
                            <button
                              className={`listen-icon-btn ${speakingIndex === index ? "is-speaking" : ""} ${speechLoadingIndex === index ? "is-loading" : ""}`}
                              aria-label={speechLoadingIndex === index ? "Generating audio…" : "Listen to response"}
                              title={speechLoadingIndex === index ? "Generating audio…" : "Listen"}
                              onClick={() => handleSpeak(msg.content, index)}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path className="sound-wave sound-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                <path className="sound-wave sound-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                        {speechError?.index === index && (
                          <p className="speech-error-text">{speechError.message}</p>
                        )}
                        <Markdown className="chat-markdown">{msg.content}</Markdown>
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="chat-message chat-agent">
                    <div className="chat-bubble chat-typing">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}
              </div>

              <form className="chat-form" onSubmit={handleSendChat}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="e.g. Why did Q1 lose points?"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={`chat-mic-btn ${isListening ? "chat-mic-active" : ""}`}
                  onClick={toggleListening}
                  title={isListening ? "Stop Listening" : "Start Voice Input"}
                  aria-label="Microphone">
                  <Icon name="mic" />
                </button>
                <button
                  className="chat-send-btn"
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  aria-label="Send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 19V5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
            </div>
          </section>
        )}
      
        {/* TAB 5: MODELS ARCHITECTURE */}
        {activeTab === "models" && (
          <section className="view">
            <header className="view-header">
              <div>
                <p className="view-eyebrow">Pipeline Architecture</p>
                <h1>Active Agent Models</h1>
                <p className="view-subtitle">
                  Inspect the specialized models, reasoning modalities, and deterministic guardrails powering each stage.
                </p>
              </div>
            </header>

          {modelsLoading && (
            <p className="view-subtitle">
              Loading active pipeline configuration...
            </p>
          )}

          {modelsError && (
            <p className="error-text">
              {modelsError}
            </p>
          )}

          {!modelsLoading && !modelsError && agentModels.length === 0 && (
            <p className="view-subtitle">
              No pipeline models were reported by the server.
            </p>
          )}

          {!modelsLoading && !modelsError && agentModels.length > 0 && (
            <div className="models-tab-grid">
              {agentModels.map((item) => {
                const iconKey = AGENT_ICON_MAP[item.agent] || "models";

                return (
                  <div key={item.agent} className="model-spec-card">
                    <div className="model-spec-header">
                      <div
                        className="model-spec-title-wrap"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span
                          className="model-agent-icon"
                          style={{
                            color: "var(--brand-primary, #3b82f6)",
                            display: "flex",
                          }}
                        >
                          <Icon name={iconKey} />
                        </span>

                        <div>
                          <h3 className="model-spec-name">
                            {item.agent}
                          </h3>

                          <span className="model-spec-role">
                            {item.role}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`model-pill-badge ${
                          item.provider?.toLowerCase().includes("bodhan")
                            ? "badge-bodhan"
                            : item.model?.toLowerCase().includes("gemini")
                            ? "badge-gemini"
                            : "badge-python"
                        }`}
                      >
                        {item.type}
                      </span>
                    </div>

                    <p className="model-spec-desc">
                      {item.desc}
                    </p>

                    <div className="model-spec-footer">
                      <span className="model-label">
                        Provider / Model:
                      </span>

                      <span className="model-stack">
                        {item.provider && <span className="model-provider">{item.provider}</span>}
                        <code className="model-code-tag">
                          {item.model}
                        </code>
                      </span>
                    </div>
                    {item.cost_note && (
                      <p className="model-cost-note">{item.cost_note}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          </section>
        )}

        </main>

      <nav className="mobile-tabbar">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`mobile-tab ${activeTab === item.id ? "mobile-tab-active" : ""}`}
            onClick={() => goToTab(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === "results" && hasNewResult && <span className="nav-dot" aria-hidden="true" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
