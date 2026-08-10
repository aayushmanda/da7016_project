import { useEffect, useRef, useState } from 'react';
import '../styles.css';

const samplePayload = {
  questions: [
    {
      id: 'q1',
      prompt: 'Explain the difference between supervised and unsupervised learning.',
      model_answer:
        'Supervised learning uses labeled data to train a model, whereas unsupervised learning finds patterns in unlabeled data.',
      rubric: [
        { description: 'Defines supervised learning', weight: 4 },
        { description: 'Defines unsupervised learning', weight: 4 },
        { description: 'Provides a clear contrast', weight: 2 },
      ],
    },
  ],
  answers: {
    q1: 'Supervised learning uses labeled data. Unsupervised learning finds patterns in unlabeled data.',
  },
};

function App() {
  const [payload, setPayload] = useState(JSON.stringify(samplePayload, null, 2));
  const [response, setResponse] = useState(null);
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (last.role === 'user') {
      inputRef.current?.focus();
    }
  }, [messages]);

  async function handleAssess() {
    setError('');
    let payloadObject;

    try {
      payloadObject = JSON.parse(payload);
    } catch (err) {
      setError('Please provide valid JSON payload.');
      return;
    }

    setLoading(true);
    const body = { payload: payloadObject, file: null };
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payloadObject));
    if (file) {
      formData.append('file', file);
    }

    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      setResponse(result);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Assessment complete.' }]);
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    const messageText = event.target.elements.message.value.trim();
    if (!messageText) return;

    const nextMessages = [...messages, { role: 'user', content: messageText }];
    setMessages(nextMessages);
    event.target.reset();
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      setError(err.message || 'Chat request failed.');
    } finally {
      setLoading(false);
    }
  }

  const assessmentData = response?.result ?? response;
  const resultItems = Array.isArray(assessmentData)
    ? assessmentData
    : assessmentData && typeof assessmentData === 'object'
    ? Object.values(assessmentData)
    : [];
  const overallScore = resultItems.length
    ? resultItems.reduce((sum, item) => sum + (item?.score || 0), 0) / resultItems.length
    : assessmentData?.score;

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Auto-Assessment</span>
          <h1>High-end grading with intelligent feedback and chat.</h1>
          <p>
            Upload answer sheets, rubrics, and optional documents. Get a
            polished score report plus a live chat experience for follow-up
            questions.
          </p>
        </div>
        <div className="hero-actions">
          <button className="button button-primary" onClick={handleAssess} disabled={loading}>
            {loading ? 'Processing...' : 'Run Assessment'}
          </button>
          <label className="upload-pill">
            {file ? file.name : 'Attach image / PDF'}
            <input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
        </div>
      </header>

      <main>
        <section className="panel split-panel">
          <div className="panel-column">
            <div className="panel-section">
              <div className="panel-header">
                <div>
                  <p className="section-eyebrow">Payload input</p>
                  <h2>Student answer sheet</h2>
                </div>
                <button className="button button-secondary" onClick={() => setPayload(JSON.stringify(samplePayload, null, 2))}>
                  Load sample
                </button>
              </div>
              <textarea
                id="payloadInput"
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                aria-label="Assessment payload JSON"
              />
            </div>
          </div>

          <div className="panel-column">
            <div className="panel-section">
              <div className="panel-header">
                <div>
                  <p className="section-eyebrow">Assessment report</p>
                  <h2>Visual summary</h2>
                </div>
                <div className="result-actions">
                  <button className="button button-muted" onClick={() => navigator.clipboard.writeText(JSON.stringify(response, null, 2))}>
                    Copy report
                  </button>
                </div>
              </div>

              <div className="report-card">
                <div className="report-card-header">
                  <div>
                    <p className="label">Overall score</p>
                    <div className="score-pill">{response?.score ?? '—'} / 10</div>
                  </div>
                </div>

                <div className="report-content">
                  <p className="result-summary-text">
                    {response?.message || 'Run the assessment to generate a detailed grading report.'}
                  </p>
                  <pre className="result-json">{JSON.stringify(response, null, 2)}</pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel chat-panel">
          <div className="panel-header">
            <div>
              <p className="section-eyebrow">Live chat</p>
              <h2>Ask the agent</h2>
            </div>
          </div>
          <div className="chat-window">
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
                <span className="chat-role">{message.role === 'user' ? 'You' : 'Agent'}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={handleSendMessage}>
            <input ref={inputRef} name="message" placeholder="Ask a question about the assessment..." />
            <button className="button button-primary" type="submit" disabled={loading}>
              Send
            </button>
          </form>
        </section>

        {error && <div className="toast-error">{error}</div>}
      </main>
    </div>
  );
}

export default App;
