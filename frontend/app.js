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

const payloadInput = document.querySelector('#payloadInput');
const resultCards = document.querySelector('#resultCards');
const resultSummary = document.querySelector('#resultSummary');
const submitButton = document.querySelector('#submitButton');
const sampleButton = document.querySelector('#sampleButton');
const copyButton = document.querySelector('#copyButton');
const toggleModeButton = document.querySelector('#toggleModeButton');
const resultJson = document.querySelector('#resultJson');

let isRawMode = false;

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

  resultSummary.querySelector('.score-badge').textContent = formatScore(averageScore || 0);
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

  setLoading(true);
  renderRaw('Running assessment...');

  try {
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
    renderResponse(json);
  } catch (error) {
    renderRaw(error.message || error);
  } finally {
    setLoading(false);
  }
});
