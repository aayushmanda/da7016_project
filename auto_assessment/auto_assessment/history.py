import json
import sqlite3
import uuid
from datetime import datetime, timezone

DB_PATH = "assessment_history.db"


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS assessments (
                assessment_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                question_paper_filename TEXT,
                student_filename TEXT,
                score REAL,
                max_score REAL,
                report_json TEXT NOT NULL,
                context_json TEXT NOT NULL
            )
        """)