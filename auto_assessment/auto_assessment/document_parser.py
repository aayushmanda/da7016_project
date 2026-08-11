import io
from typing import List, Tuple
from PIL import Image
import pypdf

def extract_content_from_file(filename: str, file_bytes: bytes) -> Tuple[str, List[Image.Image]]:
    """
    Parses files into text strings and PIL Images for visual evaluation.
    """
    filename_lower = filename.lower()
    text_content = ""
    images: List[Image.Image] = []

    # 1. Handle Direct Image Uploads
    if filename_lower.endswith((".png", ".jpg", ".jpeg", ".webp")):
        try:
            img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            images.append(img)
            text_content = f"[Attached Image File: {filename}]"
        except Exception as e:
            text_content = f"Error opening image {filename}: {str(e)}"

    # 2. Handle PDF Uploads
    elif filename_lower.endswith(".pdf"):
        try:
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pdf_text = []
            for i, page in enumerate(reader.pages):
                extracted = page.extract_text() or ""
                if extracted.strip():
                    pdf_text.append(f"--- Page {i+1} ---\n{extracted}")
            
            text_content = "\n".join(pdf_text) if pdf_text else f"[PDF contains no embedded text, using vision parser for {filename}]"
            
            # If pdf2image is installed, convert PDF pages into PIL images for handwriting evaluation
            try:
                from pdf2image import convert_from_bytes
                pdf_images = convert_from_bytes(file_bytes)
                images.extend(pdf_images)
            except ImportError:
                pass

        except Exception as e:
            text_content = f"Error parsing PDF {filename}: {str(e)}"

    # 3. Plain Text / Markdown Files
    else:
        try:
            text_content = file_bytes.decode("utf-8", errors="ignore")
        except Exception as e:
            text_content = f"Error reading text file {filename}: {str(e)}"

    return text_content, images