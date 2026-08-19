#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from contextlib import redirect_stdout
import uuid
from pathlib import Path
from typing import Any

from pydantic import SecretStr
from openhands.sdk import LLM, Conversation
from openhands.tools.preset.default import get_default_agent

from execute_workspace import (
    IMAGE,
    validate_git_contract,
)
from kaviar_docker_workspace import KaviarDockerWorkspace


MAX_TASK_LENGTH = 4000
MAX_ALLOWED_PATHS = 20
MODEL = "gemini/gemini-3.6-flash"


def canonical_job_id(raw: str) -> str:
    return str(uuid.UUID(raw))


def resolve_workspace(
    job_id: str,
    jobs_root: Path,
) -> Path:
    canonical_id = canonical_job_id(job_id)
    root = jobs_root.resolve()
    workspace = (root / canonical_id).resolve()

    if workspace.parent != root:
        raise RuntimeError(
            "DEVELOPMENT_TASK_WORKSPACE_OUTSIDE_ROOT"
        )

    if not workspace.is_dir():
        raise RuntimeError(
            "DEVELOPMENT_TASK_WORKSPACE_NOT_FOUND"
        )

    if not (workspace / ".git").exists():
        raise RuntimeError(
            "DEVELOPMENT_TASK_GIT_REPOSITORY_REQUIRED"
        )

    return workspace


def validate_allowed_path(
    raw: Any,
) -> str:
    if not isinstance(raw, str):
        raise RuntimeError(
            "DEVELOPMENT_TASK_ALLOWED_PATH_INVALID"
        )

    value = raw.strip().replace("\\", "/")

    if not value:
        raise RuntimeError(
            "DEVELOPMENT_TASK_ALLOWED_PATH_INVALID"
        )

    path = Path(value)

    if path.is_absolute():
        raise RuntimeError(
            "DEVELOPMENT_TASK_ALLOWED_PATH_ABSOLUTE"
        )

    parts = path.parts

    if (
        ".." in parts
        or "." in parts
        or ".git" in parts
    ):
        raise RuntimeError(
            "DEVELOPMENT_TASK_ALLOWED_PATH_FORBIDDEN"
        )

    return value


def read_request() -> dict[str, Any]:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        raise RuntimeError(
            "DEVELOPMENT_TASK_INVALID_JSON"
        ) from exc

    if not isinstance(payload, dict):
        raise RuntimeError(
            "DEVELOPMENT_TASK_INVALID_REQUEST"
        )

    task = payload.get("task")

    if not isinstance(task, str):
        raise RuntimeError(
            "DEVELOPMENT_TASK_TEXT_REQUIRED"
        )

    task = task.strip()

    if (
        not task
        or len(task) > MAX_TASK_LENGTH
    ):
        raise RuntimeError(
            "DEVELOPMENT_TASK_TEXT_INVALID"
        )

    raw_paths = payload.get("allowed_paths")

    if (
        not isinstance(raw_paths, list)
        or not raw_paths
        or len(raw_paths) > MAX_ALLOWED_PATHS
    ):
        raise RuntimeError(
            "DEVELOPMENT_TASK_ALLOWED_PATHS_INVALID"
        )

    allowed_paths = [
        validate_allowed_path(item)
        for item in raw_paths
    ]

    if len(set(allowed_paths)) != len(
        allowed_paths
    ):
        raise RuntimeError(
            "DEVELOPMENT_TASK_ALLOWED_PATHS_DUPLICATED"
        )

    return {
        "task": task,
        "allowed_paths": allowed_paths,
    }


def run_text(
    *args: str,
    cwd: Path,
) -> str:
    result = subprocess.run(
        list(args),
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    )

    return result.stdout.strip()


def run_nul_paths(
    *args: str,
    cwd: Path,
) -> list[str]:
    result = subprocess.run(
        list(args),
        cwd=cwd,
        check=True,
        capture_output=True,
    )

    return [
        item.decode("utf-8")
        for item in result.stdout.split(b"\0")
        if item
    ]


def changed_paths(
    workspace: Path,
) -> list[str]:
    tracked = run_nul_paths(
        "git",
        "diff",
        "--no-renames",
        "--name-only",
        "-z",
        "HEAD",
        "--",
        cwd=workspace,
    )

    untracked = run_nul_paths(
        "git",
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        cwd=workspace,
    )

    return sorted(
        set(tracked + untracked)
    )


def validate_changed_paths(
    changed: list[str],
    allowed_paths: list[str],
) -> None:
    allowed = set(allowed_paths)

    unauthorized = [
        path
        for path in changed
        if path not in allowed
    ]

    if unauthorized:
        raise RuntimeError(
            "DEVELOPMENT_TASK_UNAUTHORIZED_PATHS:"
            + ",".join(unauthorized)
        )



def normalize_changed_read_permissions(
    openhands_workspace: KaviarDockerWorkspace,
    workspace: Path,
    changed: list[str],
) -> None:
    for relative_path in changed:
        host_path = workspace / relative_path

        # Arquivo removido não precisa de normalização.
        if not host_path.exists():
            continue

        # Fail-closed: não siga links criados pelo agente.
        if host_path.is_symlink():
            raise RuntimeError(
                "DEVELOPMENT_TASK_SYMLINK_CHANGE_FORBIDDEN:"
                + relative_path
            )

        if not host_path.is_file():
            raise RuntimeError(
                "DEVELOPMENT_TASK_NON_FILE_CHANGE_FORBIDDEN:"
                + relative_path
            )

        result = openhands_workspace.execute_command(
            "chmod o+r -- "
            + shlex.quote(relative_path)
        )

        if result.exit_code != 0:
            raise RuntimeError(
                "DEVELOPMENT_TASK_PERMISSION_NORMALIZATION_FAILED:"
                + relative_path
            )


def build_agent_prompt(
    task: str,
    allowed_paths: list[str],
) -> str:
    paths = "\n".join(
        f"- {path}"
        for path in allowed_paths
    )

    return f"""
Você é o Development Agent do KAVIAR.

TAREFA:
{task}

VOCÊ PODE MODIFICAR SOMENTE ESTES CAMINHOS EXATOS:
{paths}

REGRAS OBRIGATÓRIAS:
- Não modifique nenhum outro arquivo.
- Não crie arquivos fora da lista.
- Não altere .git.
- Não faça commit, branch, merge, push, fetch ou pull.
- Git somente para inspeção: status e diff.
- Não faça deploy.
- Não acesse AWS, banco de produção ou credenciais.
- Não instale pacotes.
- Não altere dependências.
- Não use rede externa.
- Faça somente a alteração necessária.
- Se a tarefa não puder ser concluída dentro destes limites,
  não contorne as regras; explique a limitação.
- Ao terminar, informe de forma curta os arquivos alterados
  e os testes/comandos de validação executados.
""".strip()


def execution_status_value(
    conversation: Conversation,
) -> str:
    status = conversation.state.execution_status
    value = getattr(status, "value", None)

    if isinstance(value, str):
        return value

    return str(status)


def execute_request(
    *,
    job_id: str,
    workspace: Path,
    request: dict[str, Any],
) -> dict[str, Any]:
    api_key = os.environ.get(
        "GEMINI_API_KEY",
        "",
    ).strip()

    if not api_key:
        raise RuntimeError(
            "DEVELOPMENT_TASK_GEMINI_KEY_REQUIRED"
        )

    branch = validate_git_contract(
        workspace,
        job_id,
    )

    initial_head = run_text(
        "git",
        "rev-parse",
        "HEAD",
        cwd=workspace,
    )

    initial_status = run_text(
        "git",
        "status",
        "--porcelain",
        cwd=workspace,
    )

    if initial_status:
        raise RuntimeError(
            "DEVELOPMENT_TASK_WORKSPACE_NOT_CLEAN"
        )

    llm = LLM(
        usage_id=f"kaviar-development-job-{job_id}",
        model=MODEL,
        api_key=SecretStr(api_key),
    )

    with KaviarDockerWorkspace(
        server_image=IMAGE,
        host_port=None,
        platform="linux/amd64",
        working_dir="/workspace/project",
        volumes=[
            f"{workspace}:/workspace/project"
        ],
        forward_env=[],
        extra_ports=False,
    ) as openhands_workspace:
        agent = get_default_agent(
            llm=llm,
            cli_mode=True,
        )

        conversation = Conversation(
            agent=agent,
            workspace=openhands_workspace,
        )

        try:
            with redirect_stdout(sys.stderr):
                conversation.send_message(
                    build_agent_prompt(
                        request["task"],
                        request["allowed_paths"],
                    )
                )

                conversation.run()

            status = execution_status_value(
                conversation
            )
        finally:
            conversation.close()

        sandbox_head = run_text(
            "git",
            "rev-parse",
            "HEAD",
            cwd=workspace,
        )

        if sandbox_head != initial_head:
            raise RuntimeError(
                "DEVELOPMENT_TASK_GIT_HEAD_CHANGED"
            )

        validate_git_contract(
            workspace,
            job_id,
        )

        sandbox_changed = changed_paths(
            workspace
        )

        if not sandbox_changed:
            raise RuntimeError(
                "DEVELOPMENT_TASK_NO_CHANGES"
            )

        validate_changed_paths(
            sandbox_changed,
            request["allowed_paths"],
        )

        normalize_changed_read_permissions(
            openhands_workspace,
            workspace,
            sandbox_changed,
        )

    final_head = run_text(
        "git",
        "rev-parse",
        "HEAD",
        cwd=workspace,
    )

    if final_head != initial_head:
        raise RuntimeError(
            "DEVELOPMENT_TASK_GIT_HEAD_CHANGED"
        )

    validate_git_contract(
        workspace,
        job_id,
    )

    changed = changed_paths(
        workspace
    )

    if not changed:
        raise RuntimeError(
            "DEVELOPMENT_TASK_NO_CHANGES"
        )

    validate_changed_paths(
        changed,
        request["allowed_paths"],
    )

    return {
        "job_id": job_id,
        "workspace": str(workspace),
        "branch": branch,
        "execution_status": status,
        "changed_paths": changed,
        "status": "COMPLETED",
    }


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--job-id",
        required=True,
    )

    parser.add_argument(
        "--jobs-root",
        required=True,
    )

    parser.add_argument(
        "--validate-only",
        action="store_true",
    )

    args = parser.parse_args()

    canonical_id = canonical_job_id(
        args.job_id
    )

    workspace = resolve_workspace(
        canonical_id,
        Path(args.jobs_root),
    )

    request = read_request()

    if args.validate_only:
        result = {
            "job_id": canonical_id,
            "workspace": str(workspace),
            "task_length": len(
                request["task"]
            ),
            "allowed_paths":
                request["allowed_paths"],
            "status": "VALIDATED",
        }
    else:
        result = execute_request(
            job_id=canonical_id,
            workspace=workspace,
            request=request,
        )

    print(
        json.dumps(
            result,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
