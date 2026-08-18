#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from pydantic import SecretStr

from openhands.sdk import LLM, Conversation
from openhands.tools.preset.planning import get_planning_tools


MODEL = "gemini/gemini-3.6-flash"


def read_request() -> dict:
    payload = json.load(sys.stdin)

    if not isinstance(payload, dict):
        raise RuntimeError("INVALID_REQUEST")

    task = payload.get("task")
    workspace = payload.get("workspace")

    if not isinstance(task, str) or not task.strip():
        raise RuntimeError("TASK_REQUIRED")

    if not isinstance(workspace, str):
        raise RuntimeError("WORKSPACE_REQUIRED")

    return {
        "task": task.strip(),
        "workspace": workspace,
    }


def build_scope_prompt(task: str) -> str:
    return f"""
Você é o KAVIAR Development Scope Planner.

Sua função é APENAS analisar o repositório e indicar quais arquivos
provavelmente precisam ser alterados para executar a tarefa.

TAREFA:
{task}

REGRAS:
- Não altere arquivos.
- Não execute comandos.
- Não crie arquivos.
- Não faça commit.
- Não proponha alterações fora do necessário.
- Antes de retornar allowed_paths, confirme que os arquivos existem no workspace.
- Use ferramentas de busca (glob/grep) para localizar arquivos reais quando necessário.
- Antes de usar grep em um path, confirme se o caminho é um arquivo existente ou diretório existente.
- Nunca passe um arquivo como parâmetro de diretório.
- Nunca invente nomes de arquivos ou caminhos.
- Retorne caminhos relativos à raiz do workspace.
- Inclua somente arquivos que realmente existem.

Retorne SOMENTE JSON válido:

{{
  "allowed_paths": [
    "caminho/arquivo"
  ],
  "rationale": "explicação curta"
}}
""".strip()


def main():
    request = read_request()

    api_key = os.environ.get(
        "GEMINI_API_KEY",
        "",
    ).strip()

    if not api_key:
        raise RuntimeError(
            "DEVELOPMENT_SCOPE_GEMINI_KEY_REQUIRED"
        )

    llm = LLM(
        usage_id="kaviar-development-scope-planner",
        model=MODEL,
        api_key=SecretStr(api_key),
    )

    agent = __import__(
        "openhands.sdk",
        fromlist=["Agent"],
    ).Agent(
        llm=llm,
        tools=get_planning_tools(),
    )

    conversation = Conversation(
        agent=agent,
        workspace=request["workspace"],
    )

    try:
        conversation.send_message(
            build_scope_prompt(
                request["task"]
            )
        )

        conversation.run()

        print(conversation.state.events[-1])

    finally:
        conversation.close()


if __name__ == "__main__":
    main()
