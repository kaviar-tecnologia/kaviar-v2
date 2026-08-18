#!/usr/bin/env python3

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))

import execute_workspace as target


JOB_ID = "6cbd1c90-aff8-4bc6-8644-876d283c8058"
BRANCH = "agent/job-6cbd1c90aff8"


class ExecuteWorkspaceTests(unittest.TestCase):
    def test_rejects_invalid_job_id(self):
        with self.assertRaises(ValueError):
            target.canonical_job_id("../../etc/passwd")

    def test_rejects_missing_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_EXECUTOR_WORKSPACE_NOT_FOUND",
            ):
                target.resolve_workspace(
                    JOB_ID,
                    Path(tmp),
                )

    def test_rejects_branch_mismatch(self):
        workspace = Path("/tmp/workspace")

        with patch.object(
            target,
            "run",
            return_value="main",
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_EXECUTOR_BRANCH_MISMATCH",
            ):
                target.validate_git_contract(
                    workspace,
                    JOB_ID,
                )

    def test_rejects_enabled_fetch_remote(self):
        workspace = Path("/tmp/workspace")

        values = iter([
            BRANCH,
            "https://github.com/example/repo.git",
            "DISABLED",
        ])

        with patch.object(
            target,
            "run",
            side_effect=lambda *args, **kwargs: next(values),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_EXECUTOR_FETCH_REMOTE_ENABLED",
            ):
                target.validate_git_contract(
                    workspace,
                    JOB_ID,
                )

    def test_rejects_enabled_push_remote(self):
        workspace = Path("/tmp/workspace")

        values = iter([
            BRANCH,
            "DISABLED",
            "git@github.com:example/repo.git",
        ])

        with patch.object(
            target,
            "run",
            side_effect=lambda *args, **kwargs: next(values),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_EXECUTOR_PUSH_REMOTE_ENABLED",
            ):
                target.validate_git_contract(
                    workspace,
                    JOB_ID,
                )

    def test_validates_inside_hardened_openhands_workspace(self):
        command_result = SimpleNamespace(
            exit_code=0,
            stdout="DEVELOPMENT_EXECUTOR_VALIDATION_OK\n",
        )

        fake_workspace = MagicMock()
        fake_workspace.execute_command.return_value = (
            command_result
        )

        context = MagicMock()
        context.__enter__.return_value = fake_workspace
        context.__exit__.return_value = False

        with patch.object(
            target,
            "KaviarDockerWorkspace",
            return_value=context,
        ) as workspace_class:
            target.validate_with_openhands(
                Path("/tmp/workspace"),
                BRANCH,
            )

        workspace_class.assert_called_once()

        kwargs = workspace_class.call_args.kwargs

        self.assertEqual(
            kwargs["forward_env"],
            [],
        )
        self.assertFalse(
            kwargs["extra_ports"],
        )
        self.assertEqual(
            kwargs["working_dir"],
            "/workspace/project",
        )

        fake_workspace.execute_command.assert_called_once()


if __name__ == "__main__":
    unittest.main()
