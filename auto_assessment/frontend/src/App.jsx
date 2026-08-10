import React, { useState, useRef, useEffect } from 'react';
import './styles.css';

export default function App() {
  const [rubricFile, setRubricFile] = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const [loading, setLoading] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy JSON');
  const [errorMsg, setErrorMsg] = useState('');

  const [response, setResponse] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const chatWindowRef = useRef(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const saveFile = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
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
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus('Copy JSON'), 1200);
    });
  };

  const handleAssess = async () => {
    if (!rubricFile && !answerFile) {
      setErrorMsg('Please upload at least an answer sheet or rubric file.');
      return;
    }

    setErrorMsg('');
    setLoading(true);

    const formData = new FormData();
    if (rubricFile) formData.append('rubric_file', rubricFile);
    if (answerFile) formData.append('answer_file', answerFile);
    if (additionalInstructions.trim()) {
      formData.append('instructions', additionalInstructions.trim());
    }

    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(errText || 'Failed to process files.');
        return;
      }

      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred during assessment.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          has_assessment: !!response,
        }),
      });

      const data = await res.json();
      setChatMessages([
        ...updatedMessages,
        { role: 'assistant', content: data.answer || 'No response received.' },
      ]);
    } catch (err) {
      setChatMessages([
        ...updatedMessages,
        { role: 'assistant', content: `Chat error: ${err.message || err}` },
      ]);
    }
  };

  const renderStatusIcon = (score, weight) => {
    if (score >= weight) return <span className="rubric-icon pass">✓</span>;
    if (score >= weight * 0.5) return <span className="rubric-icon partial">•</span>;
    return <span className="rubric-icon fail">✕</span>;
  };

  const resultData = response?.result || response?.results || response;
  const questionList = Array.isArray(resultData)
    ? resultData
    : resultData && typeof resultData === 'object'
    ? Object.values(resultData)
    : [];

  const totalScore = questionList.reduce((sum, q) => sum + (q.score || 0), 0);
  const averageScore = questionList.length ? (totalScore / questionList.length).toFixed(1) : null;

  return (
    <div className="page-shell">
      <header className="top-bar">
        <div className="brand">AutoAssessment</div>
        <div className="top-meta">Upload documents, generate automatic grading, and converse with the agent.</div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Document Intelligence</span>
          <h1>Automated Exam Grading</h1>
          <p>
            Simply attach your rubric/question paper and student answer sheets. Our AI agent evaluates responses and provides question-by-question breakdown.
          </p>
        </div>
        <div className="hero-snapshot">
          <div className="snapshot-card">
            <span className="snapshot-label">Workflow</span>
            <pre>{`1. Upload Rubric / Question Paper\n2. Upload Student Answer Sheet\n3. Review Score Feed\n4. Chat to adjust or clarify grades`}</pre>
          </div>
        </div>
      </section>

      <main>
        <div className="dashboard-grid">
          <div className="panel-left" style={{ display: 'grid', gap: '24px' }}>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="section-eyebrow">Step 1</p>
                  <h2>Upload Documents</h2>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="dropzone-box">
                  <span className="dropzone-label">1. Rubric / Question Paper</span>
                  <label className="upload-pill" style={{ width: '100%', justifyContent: 'center' }}>
                    <span>{rubricFile ? `📄 ${rubricFile.name}` : '➕ Attach Rubric (PDF / Image / Text)'}</span>
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

                <div className="dropzone-box">
                  <span className="dropzone-label">2. Student Answer Sheet</span>
                  <label className="upload-pill" style={{ width: '100%', justifyContent: 'center' }}>
                    <span>{answerFile ? `📝 ${answerFile.name}` : '➕ Attach Answer Sheet (PDF / Image / Text)'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.docx,.txt"
                      onChange={(e) => setAnswerFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {answerFile && (
                    <button className="remove-link" onClick={() => setAnswerFile(null)}>
                      Remove file
                    </button>
                  )}
                </div>

                <div style={{ marginTop: '8px' }}>
                  <span className="dropzone-label">Custom Grading Instructions (Optional)</span>
                  <textarea
                    style={{ minHeight: '90px', height: '90px', marginTop: '6px' }}
                    placeholder="e.g., Be lenient on spelling, strictly evaluate math steps..."
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                  />
                </div>
              </div>

              {errorMsg && <p className="error-text">{errorMsg}</p>}

              <div className="actions" style={{ marginTop: '20px' }}>
                <button
                  className={`button button-primary ${loading ? 'button-loading' : ''}`}
                  onClick={handleAssess}
                  disabled={loading || (!rubricFile && !answerFile)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <span className="button-text">{loading ? 'Evaluating Documents...' : 'Start Assessment'}</span>
                  <span className="button-loader" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>

          <div className="panel-right">
            <section className="panel panel-results">
              <div className="panel-header result-header">
                <div>
                  <p className="section-eyebrow">Step 2</p>
                  <h2>Score Feed</h2>
                </div>
                <div className="result-actions">
                  <button className="button button-muted" onClick={handleCopy} disabled={!response}>
                    {copyStatus}
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => saveFile('assessment.json', JSON.stringify(response, null, 2), 'application/json')}
                    disabled={!response}
                  >
                    Export JSON
                  </button>
                  <button className="button button-secondary" onClick={() => setIsRawMode(!isRawMode)} disabled={!response}>
                    {isRawMode ? 'Visual Cards' : 'Raw JSON'}
                  </button>
                </div>
              </div>

              <div className="result-summary">
                <div className="score-badge" aria-hidden="true">
                  {averageScore ? `${averageScore} / 10` : '— / 10'}
                </div>
                <p className="summary-text">
                  {response
                    ? `Successfully evaluated ${questionList.length || 0} questions.`
                    : 'Upload your documents on the left and click "Start Assessment".'}
                </p>
              </div>

              {!response ? (
                <div className="placeholder-box">
                  <p>No assessment generated yet.</p>
                </div>
              ) : isRawMode ? (
                <pre className="result-json">{JSON.stringify(response, null, 2)}</pre>
              ) : (
                <div className="result-cards">
                  {questionList.map((item, idx) => (
                    <article className="result-card" key={item.question_id || idx}>
                      <div className="card-meta">
                        <h3>{item.question_id || `Question ${idx + 1}`}</h3>
                        <span className="badge-pill">{(item.score || 0).toFixed(1)} / 10</span>
                      </div>
                      <div className="feedback-box">{item.feedback || 'No feedback provided.'}</div>

                      {item.criterion_scores && (
                        <ul className="rubric-list">
                          {item.criterion_scores.map((crit, cIdx) => (
                            <li key={cIdx}>
                              {renderStatusIcon(crit.score, crit.weight)}
                              <span>{crit.description}</span>
                              <span className="rubric-score">
                                {crit.score}/{crit.weight}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel chat-panel">
              <div className="panel-header chat-header">
                <div>
                  <p className="section-eyebrow">Step 3</p>
                  <h2>Agent Chat</h2>
                </div>
              </div>

              <div className="chat-window" ref={chatWindowRef}>
                {chatMessages.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 'auto' }}>
                    Ask follow-up questions or request grade adjustments...
                  </p>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.role === 'user' ? 'chat-user' : 'chat-agent'}`}>
                      <div className="chat-bubble">
                        <span className="chat-role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
                        <p style={{ margin: 0 }}>{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form className="chat-form" onSubmit={handleSendChat}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="e.g. Why did Q1 lose points? Regrade Q2..."
                  autoComplete="off"
                />
                <button className="button button-primary" type="submit" disabled={loading}>
                  Send
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}