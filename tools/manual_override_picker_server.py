#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
TOOLS_DIR = ROOT_DIR / "tools"


def infer_engine_from_base(base_name: str) -> str:
    name = Path(base_name).name
    match = re.match(r"^(?P<engine>.+)-\d{4}-\d{2}\.[A-Za-z0-9]+$", name)
    if not match:
        raise ValueError("No se pudo inferir engine desde base. Indica engine en la UI.")
    return str(match.group("engine"))


def derive_image_name(base_name: str, pos: str) -> str:
    stem = Path(base_name).stem
    return f"{stem}-{pos}.webp"


def run_rebuild_for_item(overrides_path: Path, record_id: str, base: str, engine: str, pos: str) -> str:
    effective_engine = engine or infer_engine_from_base(base)
    report_name = f"tmp_manual_picker_{record_id.replace('/', '_')}_{pos}.json"
    command = [
        sys.executable,
        str(ROOT_DIR / "rebuild_schemes_circles_from_esquemas.py"),
        "--engine",
        effective_engine,
        "--id",
        record_id,
        "--write",
        "--force-regenerate",
        "--overrides-json",
        str(overrides_path),
        "--report",
        report_name,
    ]
    run = subprocess.run(
        command,
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if run.returncode != 0:
        message = (run.stderr or run.stdout or "Error ejecutando rebuild").strip()
        raise RuntimeError(message)
    return derive_image_name(base, pos)


def parse_payload_item(payload: Dict[str, Any]) -> Tuple[str, str, str, str, List[int]]:
    record_id = str(payload.get("id") or "").strip()
    base = str(payload.get("base") or "").strip()
    engine = str(payload.get("engine") or "").strip()
    pos = str(payload.get("pos") or "").strip()
    px = payload.get("item", {}).get("px") if isinstance(payload.get("item"), dict) else None

    if not record_id or not base or not pos:
        raise ValueError("Campos requeridos: id, base, pos")
    if not isinstance(px, list) or len(px) != 4:
        raise ValueError("item.px debe ser lista de 4 enteros")
    px_int = [int(round(float(v))) for v in px]
    return record_id, base, engine, pos, px_int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Servidor local para simple_scheme_circle_marker.html con API de escritura en overrides JSON"
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host bind")
    parser.add_argument("--port", type=int, default=8765, help="Puerto")
    parser.add_argument(
        "--overrides-json",
        default="rebuild_schemes_circles_manual_overrides.json",
        help="Ruta del JSON de overrides (relativa al repo o absoluta)",
    )
    return parser.parse_args()


def load_entries(path: Path) -> Tuple[List[Dict[str, Any]], str]:
    if not path.exists():
        return [], "list"
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)], "list"
    if isinstance(raw, dict) and isinstance(raw.get("overrides"), list):
        entries = [item for item in raw.get("overrides", []) if isinstance(item, dict)]
        return entries, "object"
    raise ValueError(f"Formato no soportado en {path}")


def save_entries(path: Path, entries: List[Dict[str, Any]], mode: str) -> None:
    payload: Any
    if mode == "object":
        payload = {"overrides": entries}
    else:
        payload = entries
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=4) + "\n", encoding="utf-8")


def upsert_entry(entries: List[Dict[str, Any]], record_id: str, base: str, pos: str, px: List[int]) -> bool:
    for entry in entries:
        if (
            str(entry.get("id") or "").strip() == record_id
            and str(entry.get("base") or "").strip() == base
            and str(entry.get("pos") or "").strip() == pos
        ):
            entry["item"] = {"px": px}
            return False

    entries.append(
        {
            "id": record_id,
            "base": base,
            "pos": pos,
            "item": {"px": px},
        }
    )
    return True


class PickerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, directory: str, overrides_path: Path, **kwargs: Any) -> None:
        self.overrides_path = overrides_path
        super().__init__(*args, directory=directory, **kwargs)

    def _json(self, status: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path in {"/", "/simple_scheme_circle_marker.html", "/manual_override_picker.html"}:
            self.path = "/simple_scheme_circle_marker.html"
            return super().do_GET()

        if self.path == "/api/health":
            return self._json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "overrides_json": str(self.overrides_path),
                    "exists": self.overrides_path.exists(),
                },
            )

        return super().do_GET()

    def do_POST(self) -> None:
        if self.path not in {"/api/apply", "/api/apply-generate", "/api/apply-batch", "/api/apply-generate-batch"}:
            return self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "endpoint not found"})

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            payload = json.loads(body.decode("utf-8"))

            entries, mode = load_entries(self.overrides_path)

            if self.path in {"/api/apply-batch", "/api/apply-generate-batch"}:
                items = payload.get("items")
                if not isinstance(items, list) or not items:
                    raise ValueError("items debe ser una lista no vacia")

                created_count = 0
                image_files: List[str] = []
                for item_payload in items:
                    if not isinstance(item_payload, dict):
                        raise ValueError("Cada item debe ser un objeto")

                    record_id, base, engine, pos, px_int = parse_payload_item(item_payload)
                    created = upsert_entry(entries, record_id, base, pos, px_int)
                    if created:
                        created_count += 1

                    if self.path == "/api/apply-generate-batch":
                        image_name = run_rebuild_for_item(self.overrides_path, record_id, base, engine, pos)
                        image_files.append(image_name)
                    else:
                        image_files.append(derive_image_name(base, pos))

                save_entries(self.overrides_path, entries, mode)
                return self._json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "count": len(items),
                        "created_count": created_count,
                        "image_files": image_files,
                        "overrides_json": str(self.overrides_path),
                    },
                )

            record_id, base, engine, pos, px_int = parse_payload_item(payload)
            created = upsert_entry(entries, record_id, base, pos, px_int)
            save_entries(self.overrides_path, entries, mode)

            image_file = derive_image_name(base, pos)
            if self.path == "/api/apply-generate":
                image_file = run_rebuild_for_item(self.overrides_path, record_id, base, engine, pos)

            return self._json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "entry_created": created,
                    "px": px_int,
                    "image_file": image_file,
                    "overrides_json": str(self.overrides_path),
                },
            )
        except Exception as exc:
            return self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})


def main() -> int:
    args = parse_args()
    overrides_path = Path(args.overrides_json)
    if not overrides_path.is_absolute():
        overrides_path = ROOT_DIR / overrides_path

    def handler_factory(*handler_args: Any, **handler_kwargs: Any) -> PickerHandler:
        return PickerHandler(
            *handler_args,
            directory=str(TOOLS_DIR),
            overrides_path=overrides_path,
            **handler_kwargs,
        )

    server = ThreadingHTTPServer((args.host, args.port), handler_factory)
    print(f"Manual Override Picker: http://{args.host}:{args.port}/")
    print(f"Overrides JSON: {overrides_path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
