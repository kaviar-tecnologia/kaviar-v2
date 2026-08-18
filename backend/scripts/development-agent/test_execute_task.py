#!/usr/bin/env python3

import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

import execute_task as target


JOB_ID = "6cbd1c90-aff8-4bc6-8644-876d283c8058"


def read_payload(payload):
    with patch.object(
        sys,
        "stdin",
        io.StringIO(json.dumps(payload)),
    ):
        return target.read_request()


class ExecuteTaskContractTests(unittest.TestCase):
    def test_accepts_safe_request(self):
        result = read_payload({
            "task": "Corrigir validação do worker.",
            "allowed_paths": [
                "backend/src/services/ai/worker.ts",
                "backend/tests/worker.test.ts",
            ],
        })

        self.assertEqual(
            result["task"],
            "Corrigir validação do worker.",
        )

        self.assertEqual(
            len(result["allowed_paths"]),
            2,
        )

    def test_rejects_invalid_json(self):
        with patch.object(
            sys,
            "stdin",
            io.StringIO("{invalid"),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_TASK_INVALID_JSON",
            ):
                target.read_request()

    def test_rejects_absolute_path(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_TASK_ALLOWED_PATH_ABSOLUTE",
        ):
            read_payload({
                "task": "Teste",
                "allowed_paths": [
                    "/etc/passwd",
                ],
            })

    def test_rejects_parent_traversal(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_TASK_ALLOWED_PATH_FORBIDDEN",
        ):
            read_payload({
                "task": "Teste",
                "allowed_paths": [
                    "../../etc/passwd",
                ],
            })

    def test_rejects_git_directory(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_TASK_ALLOWED_PATH_FORBIDDEN",
        ):
            read_payload({
                "task": "Teste",
                "allowed_paths": [
                    ".git/config",
                ],
            })

    def test_rejects_duplicate_paths(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_TASK_ALLOWED_PATHS_DUPLICATED",
        ):
            read_payload({
                "task": "Teste",
                "allowed_paths": [
                    "backend/src/a.ts",
                    "backend/src/a.ts",
                ],
            })

    def test_rejects_oversized_task(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_TASK_TEXT_INVALID",
        ):
            read_payload({
                "task": "x" * (
                    target.MAX_TASK_LENGTH + 1
                ),
                "allowed_paths": [
                    "backend/src/a.ts",
                ],
            })

    def test_resolves_only_existing_git_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            workspace = root / JOB_ID
            (workspace / ".git").mkdir(
                parents=True
            )

            resolved = target.resolve_workspace(
                JOB_ID,
                root,
            )

            self.assertEqual(
                resolved,
                workspace.resolve(),
            )


    def test_accepts_changes_only_inside_allowed_paths(self):
        target.validate_changed_paths(
            [
                "backend/src/a.ts",
                "backend/tests/a.test.ts",
            ],
            [
                "backend/src/a.ts",
                "backend/tests/a.test.ts",
            ],
        )

    def test_rejects_change_outside_allowed_paths(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "DEVELOPMENT_TASK_UNAUTHORIZED_PATHS",
        ):
            target.validate_changed_paths(
                [
                    "backend/src/a.ts",
                    "backend/src/forbidden.ts",
                ],
                [
                    "backend/src/a.ts",
                ],
            )

    def test_changed_paths_includes_tracked_and_untracked(self):
        with patch.object(
            target,
            "run_nul_paths",
            side_effect=[
                [
                    "backend/src/a.ts",
                ],
                [
                    "backend/tests/new.test.ts",
                ],
            ],
        ):
            changed = target.changed_paths(
                Path("/tmp/workspace")
            )

        self.assertEqual(
            changed,
            [
                "backend/src/a.ts",
                "backend/tests/new.test.ts",
            ],
        )

    def test_rejects_execution_if_agent_changes_git_head(self):
        workspace = Path("/tmp/workspace")

        fake_conversation = unittest.mock.MagicMock()
        fake_conversation.state.execution_status.value = (
            "finished"
        )

        fake_context = unittest.mock.MagicMock()
        fake_context.__enter__.return_value = (
            unittest.mock.MagicMock()
        )
        fake_context.__exit__.return_value = False

        with patch.dict(
            target.os.environ,
            {
                "GEMINI_API_KEY": "test-only-key",
            },
        ), patch.object(
            target,
            "validate_git_contract",
            return_value="agent/job-6cbd1c90aff8",
        ), patch.object(
            target,
            "run_text",
            side_effect=[
                "head-before",
                "",
                "head-after",
            ],
        ), patch.object(
            target,
            "LLM",
        ), patch.object(
            target,
            "get_default_agent",
        ), patch.object(
            target,
            "Conversation",
            return_value=fake_conversation,
        ), patch.object(
            target,
            "KaviarDockerWorkspace",
            return_value=fake_context,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_TASK_GIT_HEAD_CHANGED",
            ):
                target.execute_request(
                    job_id=JOB_ID,
                    workspace=workspace,
                    request={
                        "task": "Teste",
                        "allowed_paths": [
                            "backend/src/a.ts",
                        ],
                    },
                )

        fake_conversation.close.assert_called_once()


    def test_rejects_finished_agent_when_no_changes_exist(self):
        workspace = Path("/tmp/workspace")

        fake_conversation = unittest.mock.MagicMock()
        fake_conversation.state.execution_status.value = (
            "finished"
        )

        fake_context = unittest.mock.MagicMock()
        fake_context.__enter__.return_value = (
            unittest.mock.MagicMock()
        )
        fake_context.__exit__.return_value = False

        with patch.dict(
            target.os.environ,
            {
                "GEMINI_API_KEY": "test-only-key",
            },
        ), patch.object(
            target,
            "validate_git_contract",
            return_value="agent/job-6cbd1c90aff8",
        ), patch.object(
            target,
            "run_text",
            side_effect=[
                "head-same",
                "",
                "head-same",
            ],
        ), patch.object(
            target,
            "changed_paths",
            return_value=[],
        ), patch.object(
            target,
            "LLM",
        ), patch.object(
            target,
            "get_default_agent",
        ), patch.object(
            target,
            "Conversation",
            return_value=fake_conversation,
        ), patch.object(
            target,
            "KaviarDockerWorkspace",
            return_value=fake_context,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_TASK_NO_CHANGES",
            ):
                target.execute_request(
                    job_id=JOB_ID,
                    workspace=workspace,
                    request={
                        "task": "Criar arquivo",
                        "allowed_paths": [
                            "backend/src/a.ts",
                        ],
                    },
                )

        fake_conversation.close.assert_called_once()


    def test_normalizes_read_permission_for_changed_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            relative = "backend/src/a.ts"
            target_file = workspace / relative
            target_file.parent.mkdir(
                parents=True
            )
            target_file.write_text("teste\n")

            fake_result = unittest.mock.MagicMock()
            fake_result.exit_code = 0

            fake_workspace = unittest.mock.MagicMock()
            fake_workspace.execute_command.return_value = (
                fake_result
            )

            target.normalize_changed_read_permissions(
                fake_workspace,
                workspace,
                [relative],
            )

            fake_workspace.execute_command.assert_called_once_with(
                "chmod o+r -- backend/src/a.ts"
            )

    def test_permission_normalization_skips_deleted_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)

            fake_workspace = unittest.mock.MagicMock()

            target.normalize_changed_read_permissions(
                fake_workspace,
                workspace,
                ["backend/src/deleted.ts"],
            )

            fake_workspace.execute_command.assert_not_called()

    def test_permission_normalization_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)

            outside = workspace / "outside.txt"
            outside.write_text("fora\n")

            relative = "backend/src/link.ts"
            link = workspace / relative
            link.parent.mkdir(
                parents=True
            )
            link.symlink_to(outside)

            fake_workspace = unittest.mock.MagicMock()

            with self.assertRaisesRegex(
                RuntimeError,
                "DEVELOPMENT_TASK_SYMLINK_CHANGE_FORBIDDEN",
            ):
                target.normalize_changed_read_permissions(
                    fake_workspace,
                    workspace,
                    [relative],
                )

            fake_workspace.execute_command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
