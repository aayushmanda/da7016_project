import os

WEB_PY_PATH = "/workspaces/da7016_project/auto_assessment/auto_assessment/web.py"

def fix_history_imports():
    if not os.path.exists(WEB_PY_PATH):
        print(f"[-] Could not find {WEB_PY_PATH}")
        return

    with open(WEB_PY_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # Check if history imports exist
    import_snippet = """from history import (
    init_db,
    save_assessment,
    list_recent_assessments,
    get_assessment,
    update_chat_history
)"""

    # If list_recent_assessments is missing from history import, fix it
    if "list_recent_assessments" not in content.split("def voice_chat_endpoint")[0]:
        if "from history import" in content:
            # Replace existing from history import line
            content = re.sub(
                r"from history import [^\n]+",
                import_snippet,
                content
            )
        else:
            content = import_snippet + "\n" + content
        print("[+] Fixed list_recent_assessments import at top of web.py.")

    with open(WEB_PY_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[✓] Saved updated imports in {WEB_PY_PATH}")

if __name__ == "__main__":
    import re
    fix_history_imports()