#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

from pydantic import SecretStr

from openhands.sdk import LLM, Conversation
from openhands.sdk.conversation.response_utils import get_agent_final_response
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
        with redirect_stdout(sys.stderr):
            conversation.send_message(
                build_scope_prompt(
                    request["task"]
                )
            )

            conversation.run()

        raw_response = get_agent_final_response(
            conversation.state.events
        ).strip()

        if not raw_response:
            raise RuntimeError(
                "DEVELOPMENT_SCOPE_EMPTY_RESPONSE"
            )

        try:
            parsed = json.loads(raw_response)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "DEVELOPMENT_SCOPE_INVALID_JSON"
            ) from exc

        if not isinstance(parsed, dict):
            raise RuntimeError(
                "DEVELOPMENT_SCOPE_INVALID_OUTPUT"
            )

        allowed_paths = parsed.get("allowed_paths")
        rationale = parsed.get("rationale", "")

        if (
            not isinstance(allowed_paths, list)
            or not 1 <= len(allowed_paths) <= 20
            or not all(
                isinstance(item, str) and item.strip()
                for item in allowed_paths
            )
        ):
            raise RuntimeError(
                "DEVELOPMENT_SCOPE_INVALID_ALLOWED_PATHS"
            )

        if not isinstance(rationale, str):
            raise RuntimeError(
                "DEVELOPMENT_SCOPE_INVALID_RATIONALE"
            )

        workspace_root = Path(
            request["workspace"]
        ).resolve()

        normalized_paths = []

        for item in allowed_paths:
            relative = Path(item.strip())

            if (
                relative.is_absolute()
                or ".." in relative.parts
                or ".git" in relative.parts
            ):
                raise RuntimeError(
                    "DEVELOPMENT_SCOPE_INVALID_PATH"
                )

            target = (
                workspace_root / relative
            ).resolve()

            try:
                target.relative_to(workspace_root)
            except ValueError as exc:
                raise RuntimeError(
                    "DEVELOPMENT_SCOPE_PATH_ESCAPE"
                ) from exc

            if not target.is_file():
                raise RuntimeError(
                    "DEVELOPMENT_SCOPE_PATH_NOT_FOUND"
                )

            normalized_paths.append(
                relative.as_posix()
            )

        if len(set(normalized_paths)) != len(
            normalized_paths
        ):
            raise RuntimeError(
                "DEVELOPMENT_SCOPE_DUPLICATE_PATH"
            )

        result = {
            "allowed_paths": normalized_paths,
            "rationale": rationale.strip(),
        }

        print(
            json.dumps(
                result,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )

    finally:
        conversation.close()


if __name__ == "__main__":
    main()
