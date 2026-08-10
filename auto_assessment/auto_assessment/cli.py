from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import typer
from rich.console import Console
from rich.json import JSON
from rich.panel import Panel

from auto_assessment.llm import create_agent

app = typer.Typer(help="Auto-Assessment CLI for rubric grading", add_completion=False)
console = Console()


def _extract_text(response: str | list | dict) -> str:
    if isinstance(response, list):
        return " ".join(str(item) for item in response)
    if isinstance(response, dict):
        return json.dumps(response, indent=2)
    return str(response)


@app.command()
def assess(
    payload: Path = typer.Argument(..., help="Path to JSON payload file"),
) -> None:
    if not payload.exists():
        console.print(f"[red]Error:[/red] File not found: {payload}")
        raise typer.Exit(1)

    with payload.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    agent = create_agent()
    prompt = (
        "Evaluate the provided answer sheet and rubric payload:\n"
        + json.dumps(data, indent=2)
    )

    with console.status("Assessing..."):
        result = agent.invoke({"messages": [{"content": prompt}]})
        response = _extract_text(result["messages"][-1]["content"])

    try:
        formatted = JSON(response)
    except Exception:
        formatted = response

    console.print(Panel(formatted, title="Assessment Result", border_style="green"))


@app.command()
def chat() -> None:
    console.print(Panel.fit("Assessment Agent Chat CLI", style="bold blue"))
    agent = create_agent()

    while True:
        try:
            query = console.input("[bold cyan]You:[/bold cyan] ").strip()
            if query.lower() in ("quit", "exit", "q"):
                break
            if not query:
                continue

            result = agent.invoke({"messages": [{"content": query}]})
            response = _extract_text(result["messages"][-1]["content"])
            console.print(f"[bold green]Agent:[/bold green] {response}\n")
        except KeyboardInterrupt:
            break


def main() -> None:
    app()


if __name__ == "__main__":
    main()