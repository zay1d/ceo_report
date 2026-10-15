"""Пользователи и пароли. Пароли хранятся только в виде хэша scrypt.

TCM_USERS — список «логин:хэш» через запятую или перевод строки.
Хэш получить командой:  python -m tcm.auth <пароль>
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sys
import time
from collections import defaultdict, deque

N, R, P = 2 ** 14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        kind, salt, h = stored.split("$")
    except ValueError:
        return False
    if kind != "scrypt":
        return False
    calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=N, r=R, p=P, dklen=32)
    return hmac.compare_digest(calc.hex(), h)


def load_users(raw: str | None = None) -> dict[str, str]:
    raw = raw if raw is not None else os.environ.get("TCM_USERS", "")
    users = {}
    for item in raw.replace("\n", ",").split(","):
        item = item.strip()
        if not item:
            continue
        login, _, h = item.partition(":")
        if login and h:
            users[login.strip().lower()] = h.strip()
    return users


class Throttle:
    """Не больше `limit` неудачных входов с одного адреса за `window` секунд."""

    def __init__(self, limit: int = 5, window: int = 900):
        self.limit, self.window = limit, window
        self.fails: dict[str, deque] = defaultdict(deque)

    def _trim(self, key: str) -> deque:
        q = self.fails[key]
        now = time.monotonic()
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        return len(self._trim(key)) >= self.limit

    def fail(self, key: str) -> None:
        self._trim(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self.fails.pop(key, None)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Использование: python -m tcm.auth <пароль>")
    print(hash_password(sys.argv[1]))
