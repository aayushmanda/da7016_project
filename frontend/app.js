const samplePayload = {
  questions: [
    {
      id: "q1",
      prompt: "Explain the difference between supervised and unsupervised learning.",
      model_answer:
        "Supervised learning uses labeled data to train a model, whereas unsupervised learning finds patterns in unlabeled data.",
      rubric: [
        { description: "Defines supervised learning", weight: 4 },
        { description: "Defines unsupervised learning", weight: 4 },
        { description: "Provides a clear contrast", weight: 2 },
      ],
    },
  ],
  answers: {
    q1: "Supervised learning uses labeled data. Unsupervised learning finds patterns in unlabeled data.",
  },
};

const payloadInput = document.querySelector("#payloadInput");
const resultOutput = document.querySelector("#resultOutput");
const submitButton = document.querySelector("#submitButton");
const sampleButton = document.querySelector("#sampleButton");
const llmCheckbox = document.querySelector("#llmCheckbox");

function renderResult(value) {
  resultOutput.textContent = JSON.stringify(value, null, 2);
}

function renderError(error) {
  resultOutput.textContent = `Error: ${error}`;
}

sampleButton.addEventListener("click", () => {
  payloadInput.value = JSON.stringify(samplePayload, null, 2);
});

submitButton.addEventListener("click", async () => {
  let payload;

  try {
    payload = JSON.parse(payloadInput.value);
  } catch (error) {
    renderError("Invalid JSON payload.");
    return;
  }

  resultOutput.textContent = "Running assessment...";

  try {
    const response = await fetch(`/assess?llm=${llmCheckbox.checked}` , {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      renderError(errorText);
      return;
    }

    const json = await response.json();
    renderResult(json);
  } catch (error) {
    renderError(error.message || error);
  }
});
