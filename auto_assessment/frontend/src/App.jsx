import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles.css";


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
    score: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" />
        <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="2" />
        <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="2" />
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
  };

  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {paths[name] || paths.models}
    </svg>
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

function getScoreTier(score, max) {
  const safeMax = max || 0;
  if (safeMax <= 0) return "mid";
  const pct = (score || 0) / safeMax;
  if (pct >= 0.8) return "high";
  if (pct >= 0.5) return "mid";
  return "low";
}

const emptyDispute = { disputed_criterion: "", claimed_mistake: "", evidence_quote: "" };

export default function App() {
const [agentModels, setAgentModels] = useState([]);
const [modelsLoading, setModelsLoading] = useState(false);
const [modelsError, setModelsError] = useState("");

const loadPipelineModels = async () => {
  setModelsLoading(true);
  setModelsError("");

  try {
    const res = await fetch("/api/models");

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

const handleSpeak = (text, index) => {
  if (speakingIndex === index) {
    window.speechSynthesis.cancel();
    setSpeakingIndex(null);
    return;
  }

  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => setSpeakingIndex(null);
  utterance.onerror = () => setSpeakingIndex(null);

  setSpeakingIndex(index);
  window.speechSynthesis.speak(utterance);
};

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("upload");
  const [rubricFile, setRubricFile] = useState(null);
  const [answerFiles, setAnswerFiles] = useState([]);
  const [modelAnswerFile, setModelAnswerFile] = useState(null);
  const [modelAnswerText, setModelAnswerText] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState("Copy JSON");
  const [errorMsg, setErrorMsg] = useState("");
  const [response, setResponse] = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [isBatch, setIsBatch] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatWindowRef = useRef(null);

  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [regradeOpenFor, setRegradeOpenFor] = useState(null);
  const [dispute, setDispute] = useState(emptyDispute);
  const [regradeLoading, setRegradeLoading] = useState(null);
  const [regradeNotes, setRegradeNotes] = useState({});

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/assessments/recent");
      if (!res.ok) return;
      const data = await res.json();
      setHistoryList(data.assessments || []);
    } catch (err) {
      console.warn("Failed to load history:", err);
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
      const res = await fetch(`/api/assessments/${id}`);
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
    if (modelAnswerFile) formData.append("model_answer_file", modelAnswerFile);
    if (modelAnswerText.trim()) formData.append("model_answer_text", modelAnswerText.trim());
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
      setAssessmentId(data.assessment_id || null);
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
      loadHistory();
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
        body: JSON.stringify({
          assessment_id: assessmentId,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessment_id: assessmentId,
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

  const getMaxScore = (q) => (q?.max_score ?? 10);
  const totalScore = questionList.reduce((sum, q) => sum + (q?.score || 0), 0);
  const maxTotal = questionList.reduce((sum, q) => sum + getMaxScore(q), 0);
  const averageScore = maxTotal ? ((totalScore / maxTotal) * 10).toFixed(1) : null;
  const passCount = questionList.filter((q) => (q?.score || 0) >= getMaxScore(q)).length;
  const overallTier = maxTotal ? getScoreTier(totalScore, maxTotal) : "mid";

  const studentIds = isBatch && response?.results ? Object.keys(response.results) : [];

  const goToTab = (id) => {
    setActiveTab(id);

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
                  <span className="upload-icon" aria-hidden="true"><Icon name="document" /></span>
                  <span className="upload-text">
                    {rubricFile ? rubricFile.name : "Attach rubric — PDF, image, or text"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.docx,.txt,.md,.csv"
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
                  onChange={(e) => setModelAnswerFile(e.target.files?.[0] || null)}
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
                <div className="empty-icon" aria-hidden="true"><Icon name="score" /></div>
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
                  <div className={`stat-card stat-card-${overallTier}`}>
                    <span className="stat-label">Average score</span>
                    <span className="stat-value">{averageScore ? `${averageScore}` : "—"}<small>/10</small></span>
                  </div>
                  <div className={`stat-card stat-card-${overallTier}`}>
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

                {activeReport?.strengths?.length > 0 || activeReport?.priority_growth_areas?.length > 0 ? (
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
                ) : (
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

                      return (
                        <article className="result-card" key={qid}>
                          <div className="card-meta">
                            <div>
                              <h3>{item?.question_id || `Question ${idx + 1}`}</h3>
                              {item?.concept_tested && (
                                <span className="concept-tag">{item.concept_tested}</span>
                              )}
                            </div>
                            <span className={`badge-pill badge-pill-${scoreTier}`}>
                              {questionScore.toFixed(1)} / {questionMax}
                            </span>
                          </div>

                          <div className="feedback-box">
                            {item?.feedback || "No feedback provided."}
                          </div>

                          {item?.actionable_takeaway && (
                            <div className="actionable-takeaway-box">
                              <span className="actionable-title">
                                <Icon name="lightbulb" /> Next-Time Actionable Rule:
                              </span>
                              <p>{item.actionable_takeaway}</p>
                            </div>
                          )}

                          {item?.criterion_scores?.length > 0 && (
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
                                    {crit.score}/{crit.weight}
                                  </span>
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

            {historyList.length === 0 ? (
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
                          {score.toFixed(1)} / {max.toFixed(0)}
                        </span>
                      </div>
                      <div className="feedback-box">
                        Question paper: <strong>{item.question_paper_filename || "Uploaded Paper"}</strong>
                      </div>
                      <div className="actions">
                        <button
                          className={`button ${isCurrent ? "button-muted" : "button-primary"} button-sm`}
                          onClick={() => loadAssessment(item.assessment_id)}
                        >
                          {isCurrent ? "Active In View" : "Open Assessment"}
                        </button>
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
                              className={`listen-icon-btn ${speakingIndex === index ? "is-speaking" : ""}`}
                              aria-label="Listen to response" 
                              title="Listen"
                              onClick={() => handleSpeak(msg.content, index)}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                              </svg>
                            </button>
                          )}
                        </div>
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
                          item.model?.toLowerCase().includes("gemini")
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
                        Engine / Checkpoint:
                      </span>

                      <code className="model-code-tag">
                        {item.model}
                      </code>
                    </div>
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