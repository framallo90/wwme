#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


REQUIRED_BOOK_KEYS = [
    "title",
    "author",
    "chapterOrder",
    "foundation",
    "amazon",
    "interiorFormat",
]

REQUIRED_CONFIG_KEYS = [
    "model",
    "language",
    "systemPrompt",
    "temperature",
    "autoVersioning",
    "autosaveIntervalMs",
]


def emit(level: str, message: str) -> None:
    print(f"{level}: {message}")


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        emit("ERROR", f"Falta archivo: {path}")
        return None
    except json.JSONDecodeError as exc:
        emit("ERROR", f"JSON invalido en {path}: {exc}")
        return None


def validate_required_paths(book_path: Path) -> bool:
    ok = True
    for name in ["book.json", "config.json", "chapters", "assets", "versions"]:
        target = book_path / name
        if not target.exists():
            emit("ERROR", f"Falta ruta requerida: {target}")
            ok = False
    return ok


def validate_book_metadata(book_path: Path, payload) -> bool:
    ok = True
    if not isinstance(payload, dict):
        emit("ERROR", "book.json debe ser un objeto.")
        return False

    for key in REQUIRED_BOOK_KEYS:
        if key not in payload:
            emit("ERROR", f"book.json sin clave requerida: {key}")
            ok = False

    if "storyBible" not in payload:
        emit("WARN", "book.json no trae storyBible; se asumira biblia vacia por compatibilidad legacy.")

    chapter_order = payload.get("chapterOrder", [])
    if not isinstance(chapter_order, list):
        emit("ERROR", "book.json.chapterOrder debe ser una lista.")
        return False

    chapters_dir = book_path / "chapters"
    chapter_ids = set()
    for chapter_file in sorted(chapters_dir.glob("*.json")):
        chapter_payload = load_json(chapter_file)
        if chapter_payload is None:
            ok = False
            continue
        if not isinstance(chapter_payload, dict):
            emit("ERROR", f"Capitulo invalido: {chapter_file}")
            ok = False
            continue
        chapter_id = str(chapter_payload.get("id", "")).strip()
        if not chapter_id:
            emit("ERROR", f"Capitulo sin id: {chapter_file}")
            ok = False
            continue
        chapter_ids.add(chapter_id)
        for field in ["title", "content", "createdAt", "updatedAt"]:
            if field not in chapter_payload:
                emit("ERROR", f"Capitulo {chapter_id} sin clave requerida: {field}")
                ok = False

    for chapter_id in chapter_order:
        if str(chapter_id) not in chapter_ids:
            emit("ERROR", f"chapterOrder referencia capitulo faltante: {chapter_id}")
            ok = False

    for chapter_id in chapter_ids:
        if chapter_id not in {str(item) for item in chapter_order}:
            emit("WARN", f"Capitulo presente pero no listado en chapterOrder: {chapter_id}")

    cover_path = str(payload.get("coverImage") or "").strip()
    if cover_path:
        cover_target = Path(cover_path)
        if not cover_target.is_absolute():
            cover_target = book_path / cover_path
        if not cover_target.exists():
            emit("WARN", f"coverImage no existe: {cover_target}")

    return ok


def validate_config(payload) -> bool:
    ok = True
    if not isinstance(payload, dict):
        emit("ERROR", "config.json debe ser un objeto.")
        return False

    for key in REQUIRED_CONFIG_KEYS:
        if key not in payload:
            emit("ERROR", f"config.json sin clave requerida: {key}")
            ok = False
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate WriteWMe book project integrity.")
    parser.add_argument("--book-path", required=True, help="Ruta de la carpeta del libro")
    args = parser.parse_args()

    book_path = Path(args.book_path).expanduser().resolve()
    emit("INFO", f"Verificando libro: {book_path}")
    ok = validate_required_paths(book_path)

    book_payload = load_json(book_path / "book.json")
    config_payload = load_json(book_path / "config.json")
    if book_payload is None or config_payload is None:
        emit("Final", "FAIL")
        return 1

    ok = validate_book_metadata(book_path, book_payload) and ok
    ok = validate_config(config_payload) and ok

    emit("Final", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
