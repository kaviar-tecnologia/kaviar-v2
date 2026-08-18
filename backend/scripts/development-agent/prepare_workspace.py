#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from pathlib import Path


OPENHANDS_UID = 10001


def run(*args: str, cwd: Path | None = None) -> str:
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


def ensure_child(root: Path, child: Path) -> None:
    root_resolved = root.resolve()
    child_parent = child.parent.resolve()

    if child_parent != root_resolved:
        raise RuntimeError("WORKSPACE_OUTSIDE_JOBS_ROOT")


def prepare_workspace(
    *,
    job_id: str,
    base_repo: Path,
    jobs_root: Path,
    source_branch: str,
) -> dict[str, str]:
    canonical_id = canonical_job_id(job_id)

    base_repo = base_repo.resolve()
    jobs_root = jobs_root.resolve()

    if not (base_repo / ".git").exists():
        raise RuntimeError("BASE_REPOSITORY_NOT_FOUND")

    jobs_root.mkdir(parents=True, exist_ok=True)

    workspace = jobs_root / canonical_id
    ensure_child(jobs_root, workspace)

    if workspace.exists():
        raise RuntimeError("WORKSPACE_ALREADY_EXISTS")

    run(
        "git",
        "clone",
        "--depth",
        "1",
        "--no-tags",
        "--single-branch",
        "--branch",
        source_branch,
        f"file://{base_repo}",
        str(workspace),
    )

    try:
        run(
            "git",
            "remote",
            "set-url",
            "origin",
            "DISABLED",
            cwd=workspace,
        )

        run(
            "git",
            "remote",
            "set-url",
            "--push",
            "origin",
            "DISABLED",
            cwd=workspace,
        )

        agent_branch = (
            "agent/job-"
            + canonical_id.replace("-", "")[:12]
        )

        run(
            "git",
            "switch",
            "-c",
            agent_branch,
            cwd=workspace,
        )

        run(
            "setfacl",
            "-R",
            "-m",
            f"u:{OPENHANDS_UID}:rwx",
            str(workspace),
        )

        run(
            "setfacl",
            "-R",
            "-d",
            "-m",
            f"u:{OPENHANDS_UID}:rwx",
            str(workspace),
        )

        head = run(
            "git",
            "rev-parse",
            "HEAD",
            cwd=workspace,
        )

        shallow = run(
            "git",
            "rev-parse",
            "--is-shallow-repository",
            cwd=workspace,
        )

        return {
            "job_id": canonical_id,
            "workspace": str(workspace),
            "branch": agent_branch,
            "head": head,
            "shallow": shallow,
        }

    except Exception:
        # Não removemos automaticamente o workspace aqui.
        # Cleanup será uma operação separada e explicitamente segura.
        raise


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--job-id",
        required=True,
    )

    parser.add_argument(
        "--base-repo",
        required=True,
    )

    parser.add_argument(
        "--jobs-root",
        required=True,
    )

    parser.add_argument(
        "--source-branch",
        required=True,
    )

    args = parser.parse_args()

    result = prepare_workspace(
        job_id=args.job_id,
        base_repo=Path(args.base_repo),
        jobs_root=Path(args.jobs_root),
        source_branch=args.source_branch,
    )

    print(
        json.dumps(
            result,
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
