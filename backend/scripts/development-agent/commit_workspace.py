#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from pathlib import Path


MAX_ALLOWED_PATHS = 20


def run(
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


def run_nul(
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


def canonical_job_id(raw: str) -> str:
    return str(uuid.UUID(raw))


def expected_branch(job_id: str) -> str:
    canonical = canonical_job_id(job_id)
    return (
        "agent/job-"
        + canonical.replace("-", "")[:12]
    )


def resolve_workspace(
    *,
    job_id: str,
    jobs_root: Path,
) -> Path:
    canonical = canonical_job_id(job_id)

    root = jobs_root.resolve()
    workspace = (root / canonical).resolve()

    if workspace.parent != root:
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_WORKSPACE_OUTSIDE_ROOT"
        )

    if not workspace.is_dir():
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_WORKSPACE_NOT_FOUND"
        )

    if not (workspace / ".git").exists():
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_GIT_REPOSITORY_REQUIRED"
        )

    return workspace


def normalize_allowed_paths(
    raw_paths: list[str],
) -> list[str]:
    if (
        not raw_paths
        or len(raw_paths) > MAX_ALLOWED_PATHS
    ):
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_ALLOWED_PATHS_INVALID"
        )

    normalized: list[str] = []

    for raw in raw_paths:
        value = raw.strip().replace("\\", "/")

        if not value:
            raise RuntimeError(
                "DEVELOPMENT_COMMIT_ALLOWED_PATH_INVALID"
            )

        path = Path(value)

        if path.is_absolute():
            raise RuntimeError(
                "DEVELOPMENT_COMMIT_ALLOWED_PATH_ABSOLUTE"
            )

        if (
            ".." in path.parts
            or "." in path.parts
            or ".git" in path.parts
        ):
            raise RuntimeError(
                "DEVELOPMENT_COMMIT_ALLOWED_PATH_FORBIDDEN"
            )

        normalized.append(value)

    if len(set(normalized)) != len(normalized):
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_ALLOWED_PATHS_DUPLICATED"
        )

    return normalized


def changed_paths(
    workspace: Path,
) -> list[str]:
    tracked = run_nul(
        "git",
        "diff",
        "--no-renames",
        "--name-only",
        "-z",
        "HEAD",
        "--",
        cwd=workspace,
    )

    untracked = run_nul(
        "git",
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        cwd=workspace,
    )

    return sorted(set(tracked + untracked))


def commit_workspace(
    *,
    job_id: str,
    jobs_root: Path,
    allowed_paths: list[str],
) -> dict[str, object]:
    canonical = canonical_job_id(job_id)

    workspace = resolve_workspace(
        job_id=canonical,
        jobs_root=jobs_root,
    )

    allowed = normalize_allowed_paths(
        allowed_paths,
    )

    branch = run(
        "git",
        "branch",
        "--show-current",
        cwd=workspace,
    )

    expected = expected_branch(canonical)

    if branch != expected:
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_BRANCH_INVALID"
        )

    changed = changed_paths(workspace)

    if not changed:
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_NO_CHANGES"
        )

    unauthorized = sorted(
        set(changed) - set(allowed)
    )

    if unauthorized:
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_UNAUTHORIZED_PATHS:"
            + ",".join(unauthorized)
        )

    # Nunca usar `git add .`.
    run(
        "git",
        "add",
        "--",
        *changed,
        cwd=workspace,
    )

    staged = run_nul(
        "git",
        "diff",
        "--cached",
        "--name-only",
        "--no-renames",
        "-z",
        "--",
        cwd=workspace,
    )

    staged = sorted(set(staged))

    if staged != changed:
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_STAGED_PATHS_MISMATCH"
        )

    message = (
        "chore(ai): development job "
        + canonical[:8]
    )

    run(
        "git",
        "-c",
        "user.name=KAVIAR Development Agent",
        "-c",
        "user.email=development-agent@kaviar.local",
        "commit",
        "--no-gpg-sign",
        "-m",
        message,
        cwd=workspace,
    )

    commit_sha = run(
        "git",
        "rev-parse",
        "HEAD",
        cwd=workspace,
    )

    remaining = changed_paths(workspace)

    if remaining:
        raise RuntimeError(
            "DEVELOPMENT_COMMIT_WORKTREE_NOT_CLEAN"
        )

    return {
        "job_id": canonical,
        "workspace": str(workspace),
        "branch": branch,
        "commit_sha": commit_sha,
        "changed_paths": changed,
        "status": "COMMITTED",
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
        "--allowed-path",
        action="append",
        dest="allowed_paths",
        required=True,
    )

    args = parser.parse_args()

    result = commit_workspace(
        job_id=args.job_id,
        jobs_root=Path(args.jobs_root),
        allowed_paths=args.allowed_paths,
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
