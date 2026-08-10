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
    {
      id: 'q2',
      prompt: 'Describe one real-world use case for reinforcement learning.',
      model_answer:
        'Reinforcement learning is used for autonomous systems like robotics, game playing, and recommendation engines.',
      rubric: [
        { description: 'Mentions a real-world domain', weight: 4 },
        { description: 'Explains why reinforcement learning fits', weight: 4 },
        { description: 'Uses concrete examples', weight: 2 },
      ],
    },
  ],
  answers: {
    q1: 'Supervised learning uses labeled data. Unsupervised learning finds patterns in unlabeled data.',
    q2: 'Robotics uses reinforcement learning to teach machines how to act autonomously.',
  },
};

const payloadInput = document.querySelector('#payloadInput');
const fileInput = document.querySelector('#fileInput');
const selectedFileName = document.querySelector('#selectedFileName');
const resultCards = document.querySelector('#resultCards');
const resultSummary = document.querySelector('#resultSummary');
const submitButton = document.querySelector('#submitButton');
const sampleButton = document.querySelector('#sampleButton');
const copyButton = document.querySelector('#copyButton');
const downloadJsonButton = document.querySelector('#downloadJsonButton');
const downloadTextButton = document.querySelector('#downloadTextButton');
const toggleModeButton = document.querySelector('#toggleModeButton');
const resultJson = document.querySelector('#resultJson');
const chatWindow = document.querySelector('#chatWindow');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');

let isRawMode = false;
let latestResult = null;
let latestPayload = null;
let chatMessages = [];

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    selectedFileName.textContent = fileInput.files[0].name;
  } else {
    selectedFileName.textContent = 'Attach image or PDF';
  }
});

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.classList.toggle('button-loading', loading);
  const loader = submitButton.querySelector('.button-loader');
  loader.style.opacity = loading ? '1' : '0';
}

function formatScore(score) {
  return `${score.toFixed(1)} / 10`;
}

function buildStatusIcon(score, weight) {
  if (score >= weight) return '<span class="rubric-icon pass">✓</span>';
  if (score >= weight * 0.5) return '<span class="rubric-icon partial">•</span>';
  return '<span class="rubric-icon fail">✕</span>';
}

function renderResponse(response) {
  const result = response.result || response.results || response;
  const jsonString = JSON.stringify(response, null, 2);
  resultJson.textContent = jsonString;

  const payload = Array.isArray(result) ? result : Object.values(result);
  const questionList = Array.isArray(result) ? result : payload;

  if (questionList.length === 0) {
    renderRaw('No assessment results returned.');
    return;
  }

  const totalScore = questionList.reduce((sum, item) => sum + (item.score || 0), 0);
  const averageScore = totalScore / questionList.length;

  const uploadedFileInfo = response.uploaded_file;
  resultSummary.querySelector('.score-badge').textContent = formatScore(averageScore || 0);
  resultSummary.querySelector('.summary-text').textContent = uploadedFileInfo
    ? `Uploaded file: ${uploadedFileInfo.filename} (${uploadedFileInfo.content_type}, ${uploadedFileInfo.size} bytes)`
    : 'Run the assessment to generate a detailed grading report.';

  resultCards.innerHTML = questionList
    .map((item) => {
      const rubricItems = (item.criterion_scores || []).map((criterion) => {
        const icon = buildStatusIcon(criterion.score, criterion.weight);
        return `
          <li>
            ${icon}
            <span>${criterion.description}</span>
            <span class="rubric-score">${criterion.score}/${criterion.weight}</span>
          </li>`;
      })
      .join('');

      return `
        <article class="result-card">
          <div class="card-meta">
            <h3>${item.question_id || 'Question'}</h3>
            <span class="badge-pill">${formatScore(item.score || 0)}</span>
          </div>
          <p>${item.feedback || 'No feedback available.'}</p>
          <div class="feedback-box">${item.feedback || 'No feedback available.'}</div>
          <ul class="rubric-list">${rubricItems}</ul>
        </article>`;
    })
    .join('');

  if (isRawMode) {
    resultCards.classList.add('hidden');
    resultJson.classList.remove('hidden');
  } else {
    resultCards.classList.remove('hidden');
    resultJson.classList.add('hidden');
  }
}

function saveTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function renderChat() {
  chatWindow.innerHTML = chatMessages
    .map((message) => {
      const roleClass = message.role === 'user' ? 'chat-user' : 'chat-agent';
      return `
        <div class="chat-message ${roleClass}">
          <div class="chat-bubble">
            <span class="chat-role">${message.role === 'user' ? 'You' : 'Agent'}</span>
            <p>${message.content}</p>
          </div>
        </div>`;
    })
    .join('');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendChatMessage(role, content) {
  chatMessages.push({ role, content });
  renderChat();
}

function renderRaw(text) {
  resultCards.classList.add('hidden');
  resultJson.classList.remove('hidden');
  resultJson.textContent = text;
}

function handleCopy() {
  navigator.clipboard.writeText(resultJson.textContent).then(() => {
    copyButton.textContent = 'Copied';
    setTimeout(() => (copyButton.textContent = 'Copy JSON'), 1200);
  });
}

function handleDownloadJson() {
  if (!latestResult) return;
  saveTextFile('assessment-result.json', JSON.stringify(latestResult, null, 2));
}

function handleDownloadText() {
  if (!latestResult) return;
  const exportText = JSON.stringify(latestResult, null, 2);
  saveTextFile('assessment-summary.txt', exportText);
}

sampleButton.addEventListener('click', () => {
  payloadInput.value = JSON.stringify(samplePayload, null, 2);
});

toggleModeButton.addEventListener('click', () => {
  isRawMode = !isRawMode;
  toggleModeButton.textContent = isRawMode ? 'View visual summary' : 'View raw JSON';
  if (resultCards.innerHTML.trim()) {
    resultCards.classList.toggle('hidden', isRawMode);
    resultJson.classList.toggle('hidden', !isRawMode);
  }
});

copyButton.addEventListener('click', handleCopy);

submitButton.addEventListener('click', async () => {
  let payload;

  try {
    payload = JSON.parse(payloadInput.value);
  } catch (error) {
    renderRaw('Invalid JSON payload. Please check your input.');
    return;
  }

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (fileInput.files.length > 0) {
    formData.append('file', fileInput.files[0]);
    selectedFileName.textContent = fileInput.files[0].name;
  }

  setLoading(true);
  renderRaw('Running assessment...');

  try {
    latestPayload = payload;
    const response = await fetch('/api/assess', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      renderRaw(errorText);
      return;
    }

    const json = await response.json();
    latestResult = json;
    renderResponse(json);
  } catch (error) {
    renderRaw(error.message || error);
  } finally {
    setLoading(false);
  }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  appendChatMessage('user', message);
  chatInput.value = '';
  setLoading(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatMessages,
        payload: latestPayload,
      }),
    });

    const data = await response.json();
    appendChatMessage('assistant', data.answer || 'No response received.');
  } catch (error) {
    appendChatMessage('assistant', `Chat error: ${error.message || error}`);
  } finally {
    setLoading(false);
  }
});

downloadJsonButton.addEventListener('click', handleDownloadJson);
downloadTextButton.addEventListener('click', handleDownloadText);
