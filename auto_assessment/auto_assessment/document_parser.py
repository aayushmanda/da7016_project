import io
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image


@dataclass
class ParsedDocument:
    filename: str
    text: str = ""
    images: list[Image.Image] = field(default_factory=list)
    pdf_bytes: Optional[bytes] = None
    mime_type: Optional[str] = None
    error: Optional[str] = None


def extract_content_from_file(filename: str, file_bytes: bytes) -> ParsedDocument:
    """Validate an upload and preserve PDFs intact for Gemini document processing."""
    result = ParsedDocument(filename=filename)
    lower_name = filename.lower()

    if not file_bytes:
        result.error = "The uploaded file is empty."
        return result

    if lower_name.endswith(".pdf"):
        if len(file_bytes) > 50 * 1024 * 1024:
            result.error = "The PDF exceeds the 50 MB processing limit."
            return result
        result.pdf_bytes = file_bytes
        result.mime_type = "application/pdf"
        return result

    if lower_name.endswith((".png", ".jpg", ".jpeg", ".webp")):
        try:
            result.images.append(Image.open(io.BytesIO(file_bytes)).convert("RGB"))
        except Exception as exc:
            result.error = f"Could not open the image: {exc}"
        return result

    if lower_name.endswith((".txt", ".md", ".csv")):
        result.text = file_bytes.decode("utf-8", errors="ignore").strip()
        if not result.text:
            result.error = "The uploaded text file contains no readable content."
        return result

    result.error = "Unsupported file type. Upload a PDF, image, TXT, or Markdown file."
    return result