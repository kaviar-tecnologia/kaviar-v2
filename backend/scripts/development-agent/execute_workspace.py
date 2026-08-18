#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from pathlib import Path

from kaviar_docker_workspace import KaviarDockerWorkspace


IMAGE = "ghcr.io/openhands/agent-server:latest-python"


def run(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        list(args),
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout.strip()


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
            "DEVELOPMENT_EXECUTOR_WORKSPACE_OUTSIDE_ROOT"
        )

    if not workspace.is_dir():
        raise RuntimeError(
            "DEVELOPMENT_EXECUTOR_WORKSPACE_NOT_FOUND"
        )

    if not (workspace / ".git").exists():
        raise RuntimeError(
            "DEVELOPMENT_EXECUTOR_GIT_REPOSITORY_REQUIRED"
        )

    return workspace


def validate_git_contract(
    workspace: Path,
    job_id: str,
) -> str:
    canonical_id = canonical_job_id(job_id)

    expected_branch = (
        "agent/job-"
        + canonical_id.replace("-", "")[:12]
    )

    branch = run(
        "git",
        "branch",
        "--show-current",
        cwd=workspace,
    )

    if branch != expected_branch:
        raise RuntimeError(
            "DEVELOPMENT_EXECUTOR_BRANCH_MISMATCH"
        )

    fetch_url = run(
        "git",
        "remote",
        "get-url",
        "origin",
        cwd=workspace,
    )

    push_url = run(
        "git",
        "remote",
        "get-url",
        "--push",
        "origin",
        cwd=workspace,
    )

    if fetch_url != "DISABLED":
        raise RuntimeError(
            "DEVELOPMENT_EXECUTOR_FETCH_REMOTE_ENABLED"
        )

    if push_url != "DISABLED":
        raise RuntimeError(
            "DEVELOPMENT_EXECUTOR_PUSH_REMOTE_ENABLED"
        )

    return branch


def validate_with_openhands(
    workspace: Path,
    expected_branch: str,
) -> None:
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
        result = openhands_workspace.execute_command(
            f"""
            set -eu
            cd /workspace/project

            git config --global --add \
              safe.directory /workspace/project

            test "$(git branch --show-current)" = \
              "{expected_branch}"

            test "$(git remote get-url origin)" = \
              "DISABLED"

            test "$(git remote get-url --push origin)" = \
              "DISABLED"

            test -z "$(git status --porcelain)"

            echo DEVELOPMENT_EXECUTOR_VALIDATION_OK
            """
        )

        if result.exit_code != 0:
            raise RuntimeError(
                "DEVELOPMENT_EXECUTOR_VALIDATION_FAILED"
            )

        if (
            "DEVELOPMENT_EXECUTOR_VALIDATION_OK"
            not in result.stdout
        ):
            raise RuntimeError(
                "DEVELOPMENT_EXECUTOR_CONFIRMATION_MISSING"
            )


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

    args = parser.parse_args()

    canonical_id = canonical_job_id(
        args.job_id
    )

    workspace = resolve_workspace(
        canonical_id,
        Path(args.jobs_root),
    )

    branch = validate_git_contract(
        workspace,
        canonical_id,
    )

    validate_with_openhands(
        workspace,
        branch,
    )

    print(
        json.dumps(
            {
                "job_id": canonical_id,
                "workspace": str(workspace),
                "branch": branch,
                "status": "VALIDATED",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
