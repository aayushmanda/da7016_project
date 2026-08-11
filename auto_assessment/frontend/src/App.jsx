import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles.css";

const NAV_ITEMS = [
  { id: "upload", label: "Upload", icon: "upload" },
  { id: "results", label: "Score Feed", icon: "score" },
  { id: "chat", label: "Agent Chat", icon: "chat" },
];

function Icon({ name }) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7 9l5-5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    score: (
      <>
        <path d="M4 19V10M12 19V4M20 19v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    chat: (
      <>
        <path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </>
    ),
    collapse: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
        <path d="M14 9l-2 3 2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    expand: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 9l2 3-2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// Cleans up ugly backend/Groq error strings into something a user can
// actually read, regardless of the exact wording that came through.
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

const emptyDispute = { disputed_criterion: "", claimed_mistake: "", evidence_quote: "" };

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("upload");
  const [rubricFile, setRubricFile] = useState(null);
  // Multiple answer sheets -- one student per file. Single-file uploads
  // still work exactly as before; 2+ files route to the batch endpoint.
  const [answerFiles, setAnswerFiles] = useState([]);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState("Copy JSON");
  const [errorMsg, setErrorMsg] = useState("");
  const [response, setResponse] = useState(null);
  const [isBatch, setIsBatch] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatWindowRef = useRef(null);

  const [regradeOpenFor, setRegradeOpenFor] = useState(null);
  const [dispute, setDispute] = useState(emptyDispute);
  const [regradeLoading, setRegradeLoading] = useState(null);
  const [regradeNotes, setRegradeNotes] = useState({});

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

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

  const handleCopy = () => {
    const content = JSON.stringify(response, null, 2);
    navigator.clipboard.writeText(content).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy JSON"), 1200);
    });
  };

  // Appends newly picked answer-sheet files to the existing list instead of
  // replacing it, and de-dupes by name+size so re-selecting the same file
  // doesn't create a duplicate entry.
  const handleAddAnswerFiles = (fileList) => {
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
    setAnswerFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAssess = async () => {
    if (!rubricFile && answerFiles.length === 0) {
      setErrorMsg("Please upload at least an answer sheet or rubric file.");
      return;
    }
    setErrorMsg("");
    setLoading(true);

    const useBatch = answerFiles.length > 1;

    const formData = new FormData();
    if (rubricFile) formData.append("rubric_file", rubricFile);
    if (additionalInstructions.trim()) formData.append("instructions", additionalInstructions.trim());

    if (useBatch) {
      answerFiles.forEach((f) => formData.append("answer_files", f));
      answerFiles.forEach((f) => formData.append("student_ids", f.name));
    } else if (answerFiles.length === 1) {
      formData.append("answer_file", answerFiles[0]);
    }

    try {
      const res = await fetch(useBatch ? "/api/assess/batch" : "/api/assess", {
        method: "POST",
        body: formData,
      });

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
      setResponse(data);
      setIsBatch(useBatch);
      if (useBatch && data.results) {
        const firstId = Object.keys(data.results)[0] || null;
        setSelectedStudentId(firstId);
      } else {
        setSelectedStudentId(null);
      }
      setRegradeNotes({});
      setHasNewResult(true);
      setActiveTab("results");
    } catch (err) {
      setErrorMsg(err.message || "An error occurred during assessment.");
    } finally {
      setLoading(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages, hasAssessment: !!response }),
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

  // Calls the regrade endpoint with a STRUCTURED dispute (specific claimed
  // mistake, optional criterion + evidence quote) instead of a vague reason,
  // so the backend is checking a falsifiable claim, not just "please regrade".
  // Passes student_id when in batch mode so the right student's session is
  // updated, not just "whichever was graded last".
  const handleRequestRegrade = async (questionId) => {
    if (!dispute.claimed_mistake.trim() || dispute.claimed_mistake.trim().length < 8) return;
    setRegradeLoading(questionId);

    try {
      const res = await fetch("/api/regrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: questionId,
          claimed_mistake: dispute.claimed_mistake.trim(),
          disputed_criterion: dispute.disputed_criterion.trim() || null,
          evidence_quote: dispute.evidence_quote.trim() || null,
          student_id: isBatch ? selectedStudentId : undefined,
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

      // Replace just this student's report (batch mode) or the whole
      // response (single mode) with the backend's updated version.
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
    } catch (err) {
      setRegradeNotes((prev) => ({
        ...prev,
        [questionId]: { error: err.message || "Re-evaluation failed." },
      }));
    } finally {
      setRegradeLoading(null);
    }
  };

  const renderStatusIcon = (score, weight) => {
    if (score >= weight) return <span className="rubric-icon pass">✓</span>;
    if (score >= weight * 0.5) return <span className="rubric-icon partial">~</span>;
    return <span className="rubric-icon fail">✕</span>;
  };

  // In batch mode, pull the currently selected student's report out of
  // response.results; otherwise use the single-student response as before.
  const activeReport = isBatch
    ? response?.results?.[selectedStudentId]
    : response;

  const resultData = activeReport?.result || activeReport?.results || activeReport;
  const questionList = Array.isArray(resultData)
    ? resultData
    : resultData && typeof resultData === "object"
    ? Object.values(resultData)
    : [];

  const getMaxScore = (q) => (q?.max_score ?? 10);
  const totalScore = questionList.reduce((sum, q) => sum + (q?.score || 0), 0);
  const maxTotal = questionList.reduce((sum, q) => sum + getMaxScore(q), 0);
  const averageScore = maxTotal ? ((totalScore / maxTotal) * 10).toFixed(1) : null;
  const passCount = questionList.filter((q) => (q?.score || 0) >= getMaxScore(q)).length;

  const studentIds = isBatch && response?.results ? Object.keys(response.results) : [];

  const goToTab = (id) => {
    setActiveTab(id);
    if (id === "results") setHasNewResult(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <div className="sidebar-brand">
          {sidebarOpen ? (
            <>
              <span className="brand-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2 3 7l9 5 9-5-9-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M6 10.5v5c0 .5 2.6 2.5 6 2.5s6-2 6-2.5v-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="brand-name">AutoAssessment</span>
              <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(false)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <Icon name="collapse" />
              </button>
            </>
          ) : (
            <button
              className="brand-mark brand-mark-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2 3 7l9 5 9-5-9-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M6 10.5v5c0 .5 2.6 2.5 6 2.5s6-2 6-2.5v-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
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
            >
              <Icon name={item.icon} />
              {sidebarOpen && <span>{item.label}</span>}
              {item.id === "results" && hasNewResult && <span className="nav-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-chip">
            <span className={`status-dot ${response ? "status-dot-ready" : ""}`} />
            {sidebarOpen && (response ? "Assessment ready" : "No assessment yet")}
          </div>
        </div>
      </aside>

      <main className="app-main">
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
                <span className="dropzone-label">1. Rubric / Question Paper</span>
                <label className="upload-pill">
                  <span className="upload-icon" aria-hidden="true">📄</span>
                  <span className="upload-text">
                    {rubricFile ? rubricFile.name : "Attach rubric — PDF, image, or text"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.docx,.txt"
                    onChange={(e) => setRubricFile(e.target.files?.[0] || null)}
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
                  2. Student Answer Sheet{answerFiles.length !== 1 ? "s" : ""}
                </span>
                <label className="upload-pill">
                  <span className="upload-icon" aria-hidden="true">📝</span>
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
                          ✕
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

            <div className="field-block">
              <span className="dropzone-label">Custom grading instructions (optional)</span>
              <textarea
                placeholder="e.g., Be lenient on spelling, strictly evaluate math steps..."
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
              />
            </div>

            {errorMsg && <p className="error-text">{errorMsg}</p>}

            <div className="actions">
              <button
                className={`button button-primary button-lg ${loading ? "button-loading" : ""}`}
                onClick={handleAssess}
                disabled={loading || (!rubricFile && answerFiles.length === 0)}
              >
                <span className="button-loader" aria-hidden="true" />
                <span className="button-text">
                  {loading
                    ? "Evaluating documents…"
                    : answerFiles.length > 1
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
              </div>
              <div className="result-actions">
                <button className="button button-muted" onClick={handleCopy} disabled={!response}>
                  {copyStatus}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => saveFile("assessment.json", JSON.stringify(response, null, 2), "application/json")}
                  disabled={!response}
                >
                  Export JSON
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
                <div className="empty-icon" aria-hidden="true">📊</div>
                <h3>No assessment yet</h3>
                <p>Upload a rubric and answer sheet to generate your first score feed.</p>
                <button className="button button-primary" onClick={() => goToTab("upload")}>
                  Go to upload
                </button>
              </div>
            ) : (
              <>
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

                <div className="stat-row">
                  <div className="stat-card">
                    <span className="stat-label">Average score</span>
                    <span className="stat-value">{averageScore ? `${averageScore}` : "—"}<small>/10</small></span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Total points</span>
                    <span className="stat-value">{totalScore.toFixed(1)}<small>/{maxTotal.toFixed(0)}</small></span>
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

                {isRawMode ? (
                  <pre className="result-json">{JSON.stringify(response, null, 2)}</pre>
                ) : (
                  <div className="result-cards">
                    {questionList.map((item, idx) => {
                      const qid = item?.question_id ?? `Question ${idx + 1}`;
                      const noteKey = isBatch ? `${selectedStudentId}::${qid}` : qid;
                      const note = regradeNotes[noteKey];
                      const isOpen = regradeOpenFor === noteKey;
                      const isBusy = regradeLoading === noteKey;
                      const canSubmit = dispute.claimed_mistake.trim().length >= 8;

                      return (
                        <article className="result-card" key={qid}>
                          <div className="card-meta">
                            <h3>{item?.question_id || `Question ${idx + 1}`}</h3>
                            <span className="badge-pill">{(item?.score || 0).toFixed(1)} / {item?.max_score ?? 10}</span>
                          </div>
                          <div className="feedback-box">{item?.feedback || "No feedback provided."}</div>
                          {item?.criterion_scores?.length > 0 && (
                            <ul className="rubric-list">
                              {item.criterion_scores.map((crit, cIdx) => (
                                <li key={cIdx}>
                                  {renderStatusIcon(crit.score, crit.weight)}
                                  <span>{crit.description}</span>
                                  <span className="rubric-score">{crit.score}/{crit.weight}</span>
                                </li>
                              ))}
                            </ul>
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

                          <div className="regrade-block">
                            {!isOpen ? (
                              <button
                                className="button button-ghost button-sm"
                                onClick={() => {
                                  setRegradeOpenFor(noteKey);
                                  setDispute({
                                    ...emptyDispute,
                                    disputed_criterion: item?.criterion_scores?.[0]?.description || "",
                                  });
                                }}
                              >
                                Request re-evaluation
                              </button>
                            ) : (
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
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
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
                    <div key={index} className={`chat-message ${msg.role === "user" ? "chat-user" : "chat-agent"}`}>
                      <div className="chat-bubble">
                        <span className="chat-role">{msg.role === "user" ? "You" : "Agent"}</span>
                        <div className="chat-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
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