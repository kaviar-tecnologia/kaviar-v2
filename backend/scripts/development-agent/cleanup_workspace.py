#!/usr/bin/env python3

from __future__ import annotations

import argparse
import shutil
import uuid
from pathlib import Path


def canonical_job_id(raw: str) -> str:
    return str(uuid.UUID(raw))


def cleanup_workspace(
    *,
    job_id: str,
    jobs_root: Path,
) -> None:
    canonical_id = canonical_job_id(job_id)

    root = jobs_root.resolve()
    workspace = (root / canonical_id).resolve()

    if workspace.parent != root:
        raise RuntimeError(
            "WORKSPACE_OUTSIDE_JOBS_ROOT"
        )

    if not workspace.exists():
        return

    if workspace.is_symlink():
        raise RuntimeError(
            "WORKSPACE_SYMLINK_FORBIDDEN"
        )

    if not workspace.is_dir():
        raise RuntimeError(
            "WORKSPACE_NOT_DIRECTORY"
        )

    shutil.rmtree(workspace)


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

    cleanup_workspace(
        job_id=args.job_id,
        jobs_root=Path(args.jobs_root),
    )

    print("WORKSPACE_CLEANED")


if __name__ == "__main__":
    main()
