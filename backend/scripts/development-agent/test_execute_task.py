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


if __name__ == "__main__":
    unittest.main()
