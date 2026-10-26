"""Комментарии к объектам страницы (бренд, категория, зона…).

Хранятся одним JSON-файлом в TCM_STATE_DIR: {объект: {вид: {t, at, by}}}.
Виды: «manager» — комментарий ответственного, «management» — комментарий руководства
(его видят все, а пишут только пользователи с ролью «руководство»).
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

KINDS = ("manager", "management")
MAX_TEXT = 4000
MAX_OBJ = 300


class CommentStore:
    def __init__(self, state_dir: str | os.PathLike | None):
        self.path = Path(state_dir) / "comments.json" if state_dir else None
        self.lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.path is not None

    def _read(self) -> dict:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}

    def get(self, obj: str) -> dict:
        with self.lock:
            return self._read().get(obj, {})

    def put(self, obj: str, kind: str, text: str, by: str) -> dict | None:
        """Сохраняет комментарий; пустой текст удаляет его. Возвращает сохранённую запись."""
        text = text.strip()
        with self.lock:
            data = self._read()
            items = data.setdefault(obj, {})
            item = None
            if text:
                item = items[kind] = {"t": text, "at": int(time.time()), "by": by}
            else:
                items.pop(kind, None)
                if not items:
                    data.pop(obj, None)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, self.path)
            return item


def load_managers(raw: str | None = None) -> set[str]:
    """Логины с ролью «ответственный» (TCM_MANAGERS, через запятую). Остальные — «руководство»."""
    raw = os.environ.get("TCM_MANAGERS", "") if raw is None else raw
    return {x.strip().lower() for x in raw.split(",") if x.strip()}
