#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.error
import urllib.request


def emit(level: str, message: str) -> None:
    print(f"{level}: {message}")


def request_json(url: str, method: str = "GET", payload=None):
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify local Ollama service readiness for WriteWMe.")
    parser.add_argument("--endpoint", default="http://localhost:11434", help="Base URL del servicio Ollama")
    parser.add_argument("--model", default="llama3.2:3b", help="Modelo a verificar")
    args = parser.parse_args()

    endpoint = args.endpoint.rstrip("/")
    model = args.model

    try:
        version = request_json(f"{endpoint}/api/version")
        emit("INFO", f"Servicio alcanzable. Version: {version.get('version', 'desconocida')}")
    except urllib.error.URLError as exc:
        emit("ERROR", f"No se pudo alcanzar Ollama en {endpoint}: {exc}")
        emit("Final", "FAIL")
        return 1

    try:
        tags_payload = request_json(f"{endpoint}/api/tags")
        models = [item.get("name", "") for item in tags_payload.get("models", []) if isinstance(item, dict)]
        emit("INFO", f"Modelos detectados: {', '.join(models) if models else '(ninguno)'}")
        if model not in models:
            emit("ERROR", f"Modelo requerido no encontrado: {model}")
            emit("Final", "FAIL")
            return 1
    except Exception as exc:
        emit("ERROR", f"No se pudo leer /api/tags: {exc}")
        emit("Final", "FAIL")
        return 1

    try:
        response = request_json(
            f"{endpoint}/api/generate",
            method="POST",
            payload={
                "model": model,
                "stream": False,
                "prompt": "Respond only with OK.",
            },
        )
        text = str(response.get("response", "")).strip()
        emit("INFO", f"Generacion de prueba completada: {text[:80] or '(sin texto)'}")
    except Exception as exc:
        emit("ERROR", f"Fallo la generacion de prueba con {model}: {exc}")
        emit("Final", "FAIL")
        return 1

    emit("Final", "PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
