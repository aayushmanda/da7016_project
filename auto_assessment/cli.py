from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
import typer
from rich.console import Console
from rich.json import JSON
from rich.panel import Panel

from auto_assessment.llm import create_agent

load_dotenv()

app = typer.Typer(help="Auto-Assessment CLI for rubric-based grading", add_completion=False)
console = Console()


def _extract_text(response: str | list | dict) -> str:
    if isinstance(response, list):
        return " ".join(str(item) for item in response)
    if isinstance(response, dict):
        return json.dumps(response, indent=2)
    return str(response)


def _extract_and_format_response(response: str | list | dict) -> str | JSON:
    text = _extract_text(response)
    try:
        parsed = json.loads(text)
        return JSON(json.dumps(parsed, indent=2))
    except json.JSONDecodeError:
        return text


def _run_llm_assessment(payload: Dict[str, Any]) -> str:
    agent = create_agent()
    prompt = (
        "Grade this answer sheet against the rubric. Return JSON with question_id, score, "
        "feedback, and criterion_scores for each item.\n\n"
        + json.dumps(payload, indent=2)
    )
    result = agent.invoke({"messages": [{"content": prompt}]})
    return _extract_text(result["messages"][-1]["content"])


def _validate_payload(payload_path: Path) -> Path:
    if not payload_path.exists():
        console.print(f"[red]Error:[/red] Payload not found: {payload_path}")
        raise typer.Exit(1)
    return payload_path


@app.command()
def assess(
    payload: Path = typer.Argument(..., help="Path to a JSON payload file"),
) -> None:
    """Grade an answer sheet against a rubric."""
    payload = _validate_payload(payload)

    with payload.open("r", encoding="utf-8") as handle:
        data: Dict[str, Any] = json.load(handle)

    with console.status("Assessing answers..."):
        raw_output = _run_llm_assessment(data)

    formatted = _extract_and_format_response(raw_output)
    console.print(Panel(formatted, title="Assessment Result", border_style="green"))


@app.command()
def chat() -> None:
    """Start an interactive chat session with the assessment agent."""
    console.print(Panel.fit("Assessment Agent Chat", style="bold blue"))
    console.print("Type your questions about grading or rubric-based feedback. Use [bold]quit[/bold] to exit.\n")

    agent = create_agent()

    while True:
        try:
            query = console.input("[bold cyan]You:[/bold cyan] ").strip()
            if query.lower() in ("quit", "exit", "q"):
                console.print("[dim]Goodbye![/dim]")
                break
            if not query:
                continue

            with console.status("Thinking..."):
                result = agent.invoke({"messages": [{"content": query}]})
                response = _extract_text(result["messages"][-1]["content"])

            console.print(f"[bold green]Agent:[/bold green] {response}\n")
        except KeyboardInterrupt:
            console.print("\n[dim]Goodbye![/dim]")
            break


def main() -> None:
    app()


if __name__ == "__main__":
    main()
