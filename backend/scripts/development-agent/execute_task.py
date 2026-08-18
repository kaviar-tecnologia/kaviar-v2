#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path
from typing import Any


MAX_TASK_LENGTH = 4000
MAX_ALLOWED_PATHS = 20


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

    if not args.validate_only:
        raise RuntimeError(
            "DEVELOPMENT_TASK_EXECUTION_NOT_ENABLED"
        )

    print(
        json.dumps(
            {
                "job_id": canonical_id,
                "workspace": str(workspace),
                "task_length": len(
                    request["task"]
                ),
                "allowed_paths":
                    request["allowed_paths"],
                "status": "VALIDATED",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
