#!/usr/bin/env python3
"""Linux Docker acceptance using disposable PostgreSQL and synthetic TLS only."""
import argparse
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid


def run(*args, data=None, check=True, timeout=180):
    result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr[-1500:]}")
    return result.stdout.strip()


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def main():
    if sys.flags.optimize:
        raise RuntimeError("Run without -O; acceptance assertions must remain enabled")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="setpiece-go:container-test")
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Linux":
        raise RuntimeError("Run on Linux/WSL alongside a local Linux Docker engine")
    endpoint = os.environ.get("DOCKER_HOST")
    if not endpoint:
        endpoint = json.loads(run("docker", "context", "inspect"))[0]["Endpoints"]["docker"]["Host"]
    if not endpoint.startswith("unix://"):
        raise RuntimeError("This fixture requires a local Unix-socket Docker engine")
    backend = Path(__file__).resolve().parents[1]
    if not args.skip_build:
        subprocess.run(["docker", "build", "-t", args.image, str(backend)], check=True)
    image = json.loads(run("docker", "image", "inspect", args.image))[0]
    assert image["Config"]["User"] == "65532:65532", "Image must run as the unprivileged UID/GID"
    assert image["Config"]["Entrypoint"] == ["/server", "-env-file="], "Image must ignore local .env files"
    artifact = Path(tempfile.mkdtemp(prefix="setpiece-container-test-", dir="/var/tmp"))
    names = []
    prefix = "setpiece-m5-" + uuid.uuid4().hex[:12]
    pg_name, app_name = prefix + "-db", prefix + "-app"
    pg_port, app_port = free_port(), free_port()
    while app_port == pg_port:
        app_port = free_port()
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def get(route, expected, origin=None):
        request = urllib.request.Request(f"http://127.0.0.1:{app_port}{route}")
        if origin:
            request.add_header("Origin", origin)
        try:
            response = client.open(request, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = json.loads(response.read())
            assert response.code == expected, (route, response.code, expected, body)
            return body

    def ready(expected=200):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                return get("/ready", expected)
            except (AssertionError, OSError, urllib.error.URLError):
                time.sleep(0.2)
        raise RuntimeError(f"Readiness never returned {expected}")

    def app(name, host="127.0.0.1", ca="ca.pem", mode="verify-full", extra=""):
        names.append(name)
        uri = f"postgresql://setpiece_container@{host}:{pg_port}/setpiece_m5_container?sslmode={mode}&sslrootcert=/certs/ca.pem{extra}"
        return run("docker", "run", "-d", "--name", name, "--network=host", "--read-only",
                   "--cap-drop=ALL", "--security-opt=no-new-privileges",
                   "--add-host", "database.fixture.invalid:127.0.0.1",
                   "--mount", f"type=bind,src={artifact / ca},dst=/certs/ca.pem,readonly",
                   "-e", "APP_ENV=production", "-e", "HOST=127.0.0.1", "-e", f"PORT={app_port}",
                   "-e", "SUPABASE_URL=https://fixture.invalid", "-e", "ALLOWED_ORIGINS=https://app.fixture.invalid",
                   "-e", "DATABASE_URL=" + uri, args.image)

    def stop(name):
        started = time.monotonic()
        run("docker", "stop", "--time", "15", name, timeout=20)
        elapsed = time.monotonic() - started
        state = json.loads(run("docker", "inspect", name))[0]["State"]
        assert state["ExitCode"] == 0 and not state["OOMKilled"], state
        assert elapsed < 15, "SIGTERM did not complete before the forced-stop deadline"
        return round(elapsed, 3)

    try:
        print("Preparing fresh loopback PostgreSQL and synthetic certificates", flush=True)
        for key, cert in [("server.key", "ca.pem"), ("wrong.key", "wrong-ca.pem")]:
            run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                "-keyout", str(artifact / key), "-out", str(artifact / cert), "-subj", "/CN=fixture",
                "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE")
            (artifact / cert).chmod(0o444)
        names.append(pg_name)
        run("docker", "run", "-d", "--name", pg_name, "--network=host",
            "--tmpfs", "/var/lib/postgresql/data:rw,size=256m",
            "--mount", f"type=bind,src={artifact},dst=/fixture,readonly",
            "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_USER=setpiece_container",
            "-e", "POSTGRES_DB=setpiece_m5_container", "--entrypoint", "sh", "postgres:16", "-c",
            "install -o postgres -g postgres -m 600 /fixture/server.key /tmp/server.key && "
            "install -o postgres -g postgres -m 644 /fixture/ca.pem /tmp/server.crt && "
            "exec docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1 "
            f"-p {pg_port} -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key")
        psql = ["docker", "exec", "-i", pg_name, "psql", "-h", "127.0.0.1", "-p", str(pg_port),
                "-U", "setpiece_container", "-d", "setpiece_m5_container", "-v", "ON_ERROR_STOP=1"]
        for attempt in range(60):
            result = subprocess.run(psql + ["-Atc", "SELECT 1"], capture_output=True, timeout=10)
            if result.returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("Disposable PostgreSQL failed to start")
        run(*psql, data=(backend / "internal/forum/testdata/schema.sql").read_text())
        run(*psql, data="INSERT INTO auth.users(id,created_at,email) VALUES "
            "('11111111-1111-4111-8111-111111111111',now(),'container@example.invalid'); "
            "INSERT INTO public.profiles(id,username,name,registration_complete) VALUES "
            "('11111111-1111-4111-8111-111111111111','container_fixture','Container fixture',true);")
        app(app_name)
        ready()
        get("/health", 200)
        get("/api/profile/me", 401)
        get("/ready", 403, "https://untrusted.fixture.invalid")
        assert get("/api/statistics", 200)["mostWins"]["username"] == "container_fixture"
        assert get("/api/profiles/container_fixture", 200)["username"] == "container_fixture"
        tls = run(*psql, "-Atc", "SELECT count(*) FROM pg_stat_ssl s JOIN pg_stat_activity a USING(pid) "
                  "WHERE a.application_name='setpiece-profile-read' AND s.ssl")
        assert int(tls) > 0, "Go connection was not observed using TLS"
        print("Non-root production container, PORT, TLS, health/readiness and read API passed", flush=True)
        run("docker", "pause", pg_name)
        try:
            get("/ready", 503)
            get("/health", 200)
        finally:
            run("docker", "unpause", pg_name)
        ready()
        assert get("/api/statistics", 200)["mostWins"]["username"] == "container_fixture"
        assert get("/api/profiles/container_fixture", 200)["username"] == "container_fixture"
        shutdown = stop(app_name)
        run("docker", "start", app_name)
        ready()
        assert get("/api/statistics", 200)["mostWins"]["username"] == "container_fixture"
        assert get("/api/profiles/container_fixture", 200)["username"] == "container_fixture"
        stop(app_name)
        # Export excludes mounted synthetic CA; inspect the actual runtime filesystem.
        export_path = artifact / "runtime.tar"
        run("docker", "export", "--output", str(export_path), app_name)
        with tarfile.open(export_path) as archive:
            files = [item.name for item in archive if item.isfile()]
        assert "server" in files and "etc/ssl/certs/ca-certificates.crt" in files
        assert not any(Path(name).name.startswith(".env") or name.endswith((".go", ".sql", ".key")) for name in files)
        for suffix, options in [("untrusted-ca", {"ca": "wrong-ca.pem"}), ("wrong-host", {"host": "database.fixture.invalid"})]:
            name = prefix + "-" + suffix
            app(name, **options)
            ready(503)
            get("/health", 200)
            stop(name)
        for suffix, options in [
            ("invalid-tls", {"mode": "require"}),
            ("duplicate-tls", {"extra": "&sslmode=disable"}),
            ("host-override", {"extra": "&host=127.0.0.1"}),
            ("malformed-options", {"extra": "&ignored=%zz"}),
        ]:
            invalid = prefix + "-" + suffix
            app(invalid, **options)
            assert run("docker", "wait", invalid, timeout=15) == "1", "Unsafe database configuration accepted"
            assert "production DATABASE_URL requires" in run("docker", "logs", invalid), "Did not fail at configuration boundary"
        evidence = {"image": image["Id"], "postgres_image": json.loads(run("docker", "inspect", pg_name))[0]["Image"],
                    "checks": ["non-root", "read-only-filesystem", "port", "tls-verified", "tls-negative", "database-uri-options",
                               "health", "readiness", "database-outage-recovery", "sigterm", "restart", "runtime-file-inventory"],
                    "shutdown_seconds": shutdown, "synthetic_only": True}
        (artifact / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print(json.dumps(evidence, indent=2), flush=True)
    finally:
        cleanup_errors = []
        for name in reversed(names):
            try:
                run("docker", "unpause", name, check=False, timeout=15)
                logs = subprocess.run(["docker", "logs", name], text=True,
                                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15)
                (artifact / (name + ".log")).write_text(logs.stdout)
                run("docker", "rm", "-f", "-v", name, timeout=30)
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                cleanup_errors.append(str(error))
        if cleanup_errors:
            raise RuntimeError("Fixture cleanup incomplete: " + "; ".join(cleanup_errors))
        print(f"Synthetic test artifacts retained at {artifact}", flush=True)


if __name__ == "__main__":
    main()
