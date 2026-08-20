#!/usr/bin/env python3

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

import prepare_workspace as target


JOB_ID = "49a0caa0-97ad-442c-aa5f-5228ea28b83c"


class PrepareWorkspaceTests(unittest.TestCase):
    def test_rejects_invalid_job_id(self):
        with self.assertRaises(ValueError):
            target.canonical_job_id("../../etc/passwd")

    def test_rejects_missing_base_repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            with self.assertRaisesRegex(
                RuntimeError,
                "BASE_REPOSITORY_NOT_FOUND",
            ):
                target.prepare_workspace(
                    job_id=JOB_ID,
                    base_repo=root / "missing",
                    jobs_root=root / "jobs",
                    source_branch="main",
                )

    def test_rejects_existing_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / "base"
            jobs = root / "jobs"

            (base / ".git").mkdir(parents=True)
            (jobs / JOB_ID).mkdir(parents=True)

            with self.assertRaisesRegex(
                RuntimeError,
                "WORKSPACE_ALREADY_EXISTS",
            ):
                target.prepare_workspace(
                    job_id=JOB_ID,
                    base_repo=base,
                    jobs_root=jobs,
                    source_branch="main",
                )

    def test_builds_isolated_shallow_workspace_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / "base"
            jobs = root / "jobs"

            (base / ".git").mkdir(parents=True)

            calls = []

            def fake_run(*args, cwd=None):
                calls.append((args, cwd))

                if args == (
                    "git",
                    "rev-parse",
                    "HEAD",
                ):
                    return "a" * 40

                if args == (
                    "git",
                    "rev-parse",
                    "--is-shallow-repository",
                ):
                    return "true"

                return ""

            with patch.object(
                target,
                "run",
                side_effect=fake_run,
            ):
                result = target.prepare_workspace(
                    job_id=JOB_ID,
                    base_repo=base,
                    jobs_root=jobs,
                    source_branch="main",
                )

            workspace = jobs / JOB_ID
            branch = "agent/job-49a0caa097ad"

            command_args = [
                item[0]
                for item in calls
            ]

            self.assertIn(
                (
                    "git",
                    "clone",
                    "--depth",
                    "1",
                    "--no-tags",
                    "--single-branch",
                    "--branch",
                    "main",
                    f"file://{base.resolve()}",
                    str(workspace.resolve()),
                ),
                command_args,
            )

            self.assertIn(
                (
                    "git",
                    "remote",
                    "set-url",
                    "origin",
                    "DISABLED",
                ),
                command_args,
            )

            self.assertIn(
                (
                    "git",
                    "remote",
                    "set-url",
                    "--push",
                    "origin",
                    "DISABLED",
                ),
                command_args,
            )

            self.assertIn(
                (
                    "git",
                    "switch",
                    "-c",
                    branch,
                ),
                command_args,
            )

            self.assertIn(
                (
                    "setfacl",
                    "-R",
                    "-m",
                    "u:10001:rwx",
                    str(workspace.resolve()),
                ),
                command_args,
            )

            self.assertEqual(
                result["job_id"],
                JOB_ID,
            )
            self.assertEqual(
                result["branch"],
                branch,
            )
            self.assertEqual(
                result["shallow"],
                "true",
            )
            self.assertEqual(
                result["head"],
                "a" * 40,
            )


if __name__ == "__main__":
    unittest.main()
