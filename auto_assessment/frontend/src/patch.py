import os
import re

APP_JSX_PATH = "/workspaces/da7016_project/auto_assessment/frontend/src/App.jsx"

CLEAN_SPEAK_FUNCTION = """  const fallbackBrowserSpeech = (cleanText) => {
    if (!window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const speakText = async (text) => {
    if (!text) return;
    const cleanText = text.replace(/[*#_`\\[\\]()]/g, "").trim();
    if (!cleanText) return;

    if (isSpeaking) {
      if (window.currentAudio) {
        window.currentAudio.pause();
        window.currentAudio = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);

    try {
      const res = await fetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText.slice(0, 400) }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        window.currentAudio = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          fallbackBrowserSpeech(cleanText);
        };
        audio.play().catch(() => {
          fallbackBrowserSpeech(cleanText);
        });
        return;
      }
    } catch (err) {
      console.warn("Backend TTS fallback:", err);
    }

    fallbackBrowserSpeech(cleanText);
  };"""

def fix_babel_syntax_error():
    if not os.path.exists(APP_JSX_PATH):
        print(f"[-] Could not find {APP_JSX_PATH}")
        return

    with open(APP_JSX_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # Match and replace speakText and fallbackBrowserSpeech
    pattern = re.compile(
        r"(?:const fallbackBrowserSpeech = [\s\S]*?^\s*\};\s*)?(?:const speakText = (?:async )?\([\s\S]*?^\s*\};)",
        re.MULTILINE
    )

    if pattern.search(content):
        content = pattern.sub(CLEAN_SPEAK_FUNCTION.strip(), content)
        print("[+] Replaced speakText with strict JS syntax.")
    else:
        # Direct string replacement fallback
        content = content.replace("await audio.play();", "audio.play().catch(() => { fallbackBrowserSpeech(cleanText); });")

    with open(APP_JSX_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[✓] Syntax error permanently resolved in {APP_JSX_PATH}")

if __name__ == "__main__":
    fix_babel_syntax_error()