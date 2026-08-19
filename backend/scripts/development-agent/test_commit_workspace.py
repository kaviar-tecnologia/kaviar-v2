#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from commit_workspace import (
    commit_workspace,
    expected_branch,
)


JOB_ID = "49a0caa0-97ad-442c-aa5f-5228ea28b83c"


def run(*args: str, cwd: Path) -> str:
    return subprocess.run(
        list(args),
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()


class CommitWorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.jobs_root = self.root / "jobs"
        self.workspace = self.jobs_root / JOB_ID

        self.workspace.mkdir(parents=True)

        run("git", "init", cwd=self.workspace)

        run(
            "git",
            "config",
            "user.name",
            "Test User",
            cwd=self.workspace,
        )

        run(
            "git",
            "config",
            "user.email",
            "test@example.com",
            cwd=self.workspace,
        )

        (self.workspace / "backend/tests").mkdir(
            parents=True,
        )

        self.target = (
            self.workspace
            / "backend/tests/example.test.ts"
        )

        self.target.write_text(
            "export const value = 1;\n"
        )

        run(
            "git",
            "add",
            "--",
            "backend/tests/example.test.ts",
            cwd=self.workspace,
        )

        run(
            "git",
            "commit",
            "-m",
            "initial",
            cwd=self.workspace,
        )

        run(
            "git",
            "switch",
            "-c",
            expected_branch(JOB_ID),
            cwd=self.workspace,
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_commits_only_allowed_change(self) -> None:
        self.target.write_text(
            "export const value = 2;\n"
        )

        result = commit_workspace(
            job_id=JOB_ID,
            jobs_root=self.jobs_root,
            allowed_paths=[
                "backend/tests/example.test.ts",
            ],
        )

        self.assertEqual(
            result["status"],
            "COMMITTED",
        )

        self.assertEqual(
            result["branch"],
            expected_branch(JOB_ID),
        )

        self.assertEqual(
            result["changed_paths"],
            ["backend/tests/example.test.ts"],
        )

        self.assertEqual(
            run(
                "git",
                "status",
                "--porcelain",
                cwd=self.workspace,
            ),
            "",
        )

    def test_rejects_unauthorized_change(self) -> None:
        self.target.write_text(
            "export const value = 2;\n"
        )

        other = self.workspace / "README.md"
        other.write_text("unauthorized\n")

        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_COMMIT_UNAUTHORIZED_PATHS",
        ):
            commit_workspace(
                job_id=JOB_ID,
                jobs_root=self.jobs_root,
                allowed_paths=[
                    "backend/tests/example.test.ts",
                ],
            )

    def test_rejects_wrong_branch(self) -> None:
        run(
            "git",
            "switch",
            "-c",
            "wrong-branch",
            cwd=self.workspace,
        )

        self.target.write_text(
            "export const value = 2;\n"
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_COMMIT_BRANCH_INVALID",
        ):
            commit_workspace(
                job_id=JOB_ID,
                jobs_root=self.jobs_root,
                allowed_paths=[
                    "backend/tests/example.test.ts",
                ],
            )

    def test_rejects_no_changes(self) -> None:
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_COMMIT_NO_CHANGES",
        ):
            commit_workspace(
                job_id=JOB_ID,
                jobs_root=self.jobs_root,
                allowed_paths=[
                    "backend/tests/example.test.ts",
                ],
            )


if __name__ == "__main__":
    unittest.main()
