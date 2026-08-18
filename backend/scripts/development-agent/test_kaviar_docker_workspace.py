#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

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


if __name__ == "__main__":
    unittest.main()
