"""Проверка доступа к таблице без запуска сервера.

    python -m tcm.check

Читает «Реестр 26» с теми же переменными окружения, что и сервер, и печатает сводку.
Код возврата 0 — всё в порядке, 1 — ошибка (текст ошибки в выводе).
"""
from __future__ import annotations

import sys


def main() -> int:
    try:
        from .sheets import SheetReader
        d = SheetReader().load()
    except Exception as e:  # noqa: BLE001 — нужен понятный текст для человека
        msg = str(e)
        if "403" in msg or "PERMISSION_DENIED" in msg:
            msg += ("\n→ Сервисному аккаунту не открыт доступ к таблице, или в проекте Google Cloud "
                    "не включён Google Sheets API. Откройте таблицу на чтение для client_email из ключа.")
        elif "404" in msg:
            msg += "\n→ Неверный TCM_SHEET_ID."
        print(f"ОШИБКА: {type(e).__name__}: {msg}")
        return 1
    b = d["brands"]
    last = -1
    to = sum(x["to"][last] or 0 for x in b)
    n = sum(1 for x in b if x["to"][last])
    print(f"OK: месяцы {d['months'][0]} … {d['months'][-1]}, брендов в выборке {len(b)}, зон {len(d['zones'])}")
    print(f"    {d['months'][-1]}: ТО {to / 1e6:.2f} млн $ по {n} брендам")
    q = d["quality"]
    print(f"    без строки в Тurnover: {len(q['noTurnover'])}, без вкладки бренда: {len(q['noBrandTab'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
