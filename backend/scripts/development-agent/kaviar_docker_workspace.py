#!/usr/bin/env python3

from __future__ import annotations

import os
import threading
import uuid

from openhands.workspace import DockerWorkspace
import openhands.workspace.docker.workspace as dw


class KaviarDockerWorkspace(DockerWorkspace):
    """
    DockerWorkspace endurecido para o Development Agent KAVIAR.

    Regras:
    - Agent Server publicado somente em 127.0.0.1;
    - sem portas extras de VSCode/VNC;
    - nenhuma variável do host encaminhada ao container;
    - sem montagem do Docker socket;
    - container descartável (--rm).
    """

    def _start_container(self, image: str, context) -> None:
        if self.extra_ports:
            raise RuntimeError(
                "KAVIAR_WORKSPACE_EXTRA_PORTS_DISABLED"
            )

        if self.forward_env:
            raise RuntimeError(
                "KAVIAR_WORKSPACE_ENV_FORWARDING_DISABLED"
            )

        if self.host:
            raise RuntimeError(
                "KAVIAR_WORKSPACE_CUSTOM_HOST_DISABLED"
            )

        for volume in self.volumes:
            if "/var/run/docker.sock" in volume:
                raise RuntimeError(
                    "KAVIAR_WORKSPACE_DOCKER_SOCKET_FORBIDDEN"
                )

        self._image_name = image

        if self.host_port is None:
            self.host_port = dw.find_available_tcp_port()
        else:
            self.host_port = int(self.host_port)

        if not dw.check_port_available(self.host_port):
            raise RuntimeError(
                f"Port {self.host_port} is not available"
            )

        if (
            dw.execute_command(
                ["docker", "version"]
            ).returncode
            != 0
        ):
            raise RuntimeError(
                "Docker is not available"
            )

        flags: list[str] = []

        for volume in self.volumes:
            flags += ["-v", volume]

            dw.logger.info(
                "Adding KAVIAR workspace volume: %s",
                volume,
            )

        flags += [
            "-p",
            f"127.0.0.1:{self.host_port}:8000",
        ]

        if self.enable_gpu:
            flags += ["--gpus", "all"]

        if self.network:
            flags += [
                "--network",
                self.network,
            ]

        run_cmd = [
            "docker",
            "run",
            "-d",
            "--platform",
            self.platform,
            "--rm",
            "--ulimit",
            "nofile=65536:65536",
            "--name",
            f"kaviar-agent-server-{uuid.uuid4()}",
            *flags,
            image,
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ]

        proc = dw.execute_command(run_cmd)

        if proc.returncode != 0:
            raise RuntimeError(
                "Failed to run Docker container: "
                f"{proc.stderr}"
            )

        self._container_id = proc.stdout.strip()

        dw.logger.info(
            "Started KAVIAR agent container: %s",
            self._container_id,
        )

        if self.detach_logs:
            self._logs_thread = threading.Thread(
                target=self._stream_docker_logs,
                daemon=True,
            )
            self._logs_thread.start()

        object.__setattr__(
            self,
            "host",
            f"http://127.0.0.1:{self.host_port}",
        )

        # Compatibilidade comprovada com
        # openhands-workspace 1.42.1.
        object.__setattr__(
            self,
            "api_key",
            None,
        )

        self._wait_for_health(
            timeout=self.health_check_timeout
        )

        dw.logger.info(
            "KAVIAR Docker workspace ready at %s",
            self.host,
        )

        super(
            DockerWorkspace,
            self,
        ).model_post_init(context)
