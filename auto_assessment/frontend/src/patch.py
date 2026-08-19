import os
import re

APP_JSX_PATH = os.path.join(
    os.path.dirname(__file__),
    "App.jsx"
)

if not os.path.exists(APP_JSX_PATH):
    APP_JSX_PATH = os.path.join("src", "App.jsx")

STYLES_CSS_PATH = os.path.join(
    os.path.dirname(__file__),
    "auto_assessment",
    "frontend",
    "src",
    "styles.css"
)
if not os.path.exists(STYLES_CSS_PATH):
    STYLES_CSS_PATH = os.path.join("src", "styles.css")

AGENT_MODELS_CONSTANT = """
const AGENT_MODELS = [
  { agent: "Transcriber", role: "Multimodal OCR & Parsing", model: "gemini-2.5-flash", type: "Vision", desc: "Transcribes handwritten and typed PDFs/images into clean, structured Markdown." },
  { agent: "Solver", role: "Master Reference Solution", model: "gemini-2.5-flash", type: "Reasoning", desc: "Generates step-by-step master answer key when no official key is provided." },
  { agent: "Evaluator", role: "Criterion Grading & Quotes", model: "gemini-2.5-flash", type: "Structured JSON", desc: "Evaluates student work against criteria with verbatim evidence quotes and next-time rules." },
  { agent: "Auditor", role: "Deterministic Guardrail", model: "Python Deterministic", type: "Code Guardrail", desc: "Validates score arithmetic, criterion sums, and bounding invariants in Python." },
  { agent: "Regrade Agent", role: "Dispute Quote Verification", model: "gemini-2.5-flash", type: "Auditing", desc: "Audits student disputes by verifying quoted evidence against raw submissions." },
  { agent: "Chat Agent", role: "Contextual Dialogue", model: "gemini-2.5-flash", type: "Interactive", desc: "Multi-turn tutoring agent answering student queries grounded in grading context." }
];
"""

MODELS_TAB_JSX = """
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

            <div className="models-tab-grid">
              {AGENT_MODELS.map((item, idx) => (
                <div key={idx} className="model-spec-card">
                  <div className="model-spec-header">
                    <div className="model-spec-title-wrap">
                      <h3 className="model-spec-name">{item.agent}</h3>
                      <span className="model-spec-role">{item.role}</span>
                    </div>
                    <span className={`model-pill-badge ${item.model.includes('gemini') ? 'badge-gemini' : 'badge-python'}`}>
                      {item.type}
                    </span>
                  </div>
                  <p className="model-spec-desc">{item.desc}</p>
                  <div className="model-spec-footer">
                    <span className="model-label">Engine / Checkpoint:</span>
                    <code className="model-code-tag">{item.model}</code>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
"""

CSS_ADDITIONS = """
/* --- Models Tab Spec Styles --- */
.models-tab-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.model-spec-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.model-spec-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.model-spec-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.model-spec-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 2px;
}

.model-spec-role {
  font-size: 12px;
  color: #64748b;
}

.model-pill-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.badge-gemini {
  background-color: #e0f2fe;
  color: #0369a1;
}

.badge-python {
  background-color: #dcfce7;
  color: #15803d;
}

.model-spec-desc {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  margin-bottom: 16px;
  flex: 1;
}

.model-spec-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.model-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.model-code-tag {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  background: #f1f5f9;
  color: #0f172a;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 600;
}
"""

def patch_frontend():
    if not os.path.exists(APP_JSX_PATH):
        print(f"[-] Error: Could not find {APP_JSX_PATH}")
        return False

    with open(APP_JSX_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update NAV_ITEMS to include "models" tab
    if 'id: "models"' not in content and "id: 'models'" not in content:
        # Find NAV_ITEMS array
        nav_pattern = r"(const NAV_ITEMS\s*=\s*\[)(.*?)(\];)"
        match = re.search(nav_pattern, content, re.DOTALL)
        if match:
            current_items = match.group(2).rstrip()
            new_item = '\n  { id: "models", label: "Models", icon: "models" },'
            updated_nav = f"{match.group(1)}{current_items}{new_item}\n{match.group(3)}"
            content = content.replace(match.group(0), updated_nav)
            print("[+] Added 'Models' tab to NAV_ITEMS.")

    # 2. Add icon handling for "models" in Icon component if present
    if 'name === "models"' not in content:
        icon_helper = """  if (name === "models") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
  }
"""
        if "function Icon(" in content:
            content = content.replace("function Icon({ name }) {", f"function Icon({{ name }}) {{\n{icon_helper}")
            print("[+] Added 'models' SVG icon.")

    # 3. Add AGENT_MODELS constant if missing
    if "const AGENT_MODELS =" not in content:
        if "export default function App" in content:
            content = content.replace(
                "export default function App",
                f"{AGENT_MODELS_CONSTANT.strip()}\n\nexport default function App"
            )
            print("[+] Injected AGENT_MODELS constant.")

    # 4. Inject Models View Section into JSX
    if 'activeTab === "models"' not in content and "activeTab === 'models'" not in content:
        # Insert before </main>
        if "</main>" in content:
            content = content.replace("</main>", f"{MODELS_TAB_JSX}\n      </main>")
            print("[+] Injected Models View tab section.")

    with open(APP_JSX_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[✓] Successfully updated {APP_JSX_PATH}")

    # 5. Append CSS styles if styles.css exists
    if os.path.exists(STYLES_CSS_PATH):
        with open(STYLES_CSS_PATH, "r", encoding="utf-8") as f:
            css_content = f.read()

        if ".models-tab-grid" not in css_content:
            with open(STYLES_CSS_PATH, "a", encoding="utf-8") as f:
                f.write(f"\n{CSS_ADDITIONS}\n")
            print(f"[✓] Appended model tab styles to {STYLES_CSS_PATH}")

    return True

if __name__ == "__main__":
    patch_frontend()