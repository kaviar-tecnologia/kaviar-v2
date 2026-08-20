#!/usr/bin/env python3

import sys
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from openhands.workspace import DockerWorkspace
from kaviar_docker_workspace import KaviarDockerWorkspace


IMAGE = "ghcr.io/openhands/agent-server:latest-python"


class KaviarDockerWorkspaceSecurityTests(unittest.TestCase):
    def test_rejects_extra_ports(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "KAVIAR_WORKSPACE_EXTRA_PORTS_DISABLED",
        ):
            KaviarDockerWorkspace(
                server_image=IMAGE,
                working_dir="/workspace/project",
                volumes=[],
                forward_env=[],
                extra_ports=True,
            )

    def test_rejects_forwarded_environment(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "KAVIAR_WORKSPACE_ENV_FORWARDING_DISABLED",
        ):
            KaviarDockerWorkspace(
                server_image=IMAGE,
                working_dir="/workspace/project",
                volumes=[],
                forward_env=["DATABASE_URL"],
                extra_ports=False,
            )

    def test_rejects_custom_host(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "KAVIAR_WORKSPACE_CUSTOM_HOST_DISABLED",
        ):
            KaviarDockerWorkspace(
                server_image=IMAGE,
                host="http://0.0.0.0:8000",
                working_dir="/workspace/project",
                volumes=[],
                forward_env=[],
                extra_ports=False,
            )

    def test_rejects_docker_socket_mount(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "KAVIAR_WORKSPACE_DOCKER_SOCKET_FORBIDDEN",
        ):
            KaviarDockerWorkspace(
                server_image=IMAGE,
                working_dir="/workspace/project",
                volumes=[
                    "/var/run/docker.sock:/var/run/docker.sock",
                ],
                forward_env=[],
                extra_ports=False,
            )


    def test_execute_command_defaults_to_workspace_working_dir(self):
        with patch.object(
            KaviarDockerWorkspace,
            "_start_container",
            return_value=None,
        ):
            workspace = KaviarDockerWorkspace(
                server_image=IMAGE,
                working_dir="/workspace/project",
                volumes=[],
                forward_env=[],
                extra_ports=False,
            )

        with patch.object(
            DockerWorkspace,
            "execute_command",
            return_value="COMMAND_OK",
        ) as parent_execute:
            result = workspace.execute_command(
                "pwd",
            )

        self.assertEqual(
            result,
            "COMMAND_OK",
        )

        parent_execute.assert_called_once_with(
            "pwd",
            cwd="/workspace/project",
            timeout=30.0,
        )


if __name__ == "__main__":
    unittest.main()
