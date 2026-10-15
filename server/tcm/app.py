"""Веб-сервер TCM Analytics.

Запуск (из папки server/):  uvicorn --factory tcm.app:create_app --host 0.0.0.0 --port 8000

Переменные окружения:
  TCM_SHEET_ID        ID таблицы «Реестр 26»
  TCM_SA_KEY_FILE     путь к JSON-ключу сервисного аккаунта (или TCM_SA_KEY_JSON — содержимое)
  TCM_USERS           «логин:хэш» через запятую (хэш: python -m tcm.auth <пароль>)
  TCM_SECRET          длинная случайная строка для подписи cookie сессии
  TCM_CACHE_MIN       как часто перечитывать таблицу, минут (по умолчанию 15)
  TCM_COOKIE_SECURE   1 — cookie только по HTTPS (по умолчанию), 0 — для локальной проверки
  TCM_WEB_DIR         папка со страницей (по умолчанию ../web)
"""
from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, Form, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from .auth import Throttle, check_password, load_users

log = logging.getLogger("tcm")

WEB = Path(os.environ.get("TCM_WEB_DIR", Path(__file__).resolve().parents[2] / "web"))
SESSION_DAYS = 14


class DataCache:
    """Держит последнюю версию данных; перечитывает таблицу не чаще раза в TTL.

    Если таблица недоступна, отдаёт прошлую версию с пометкой stale.
    """

    def __init__(self, loader: Callable[[], dict], ttl_sec: int):
        self.loader, self.ttl = loader, ttl_sec
        self.data: dict | None = None
        self.loaded_at = 0.0
        self.lock = threading.Lock()

    def get(self) -> dict | None:
        if self.data is not None and time.monotonic() - self.loaded_at < self.ttl:
            return self.data
        with self.lock:
            if self.data is not None and time.monotonic() - self.loaded_at < self.ttl:
                return self.data
            try:
                self.data = {**self.loader(), "stale": False}
            except Exception:
                log.exception("не удалось прочитать таблицу")
                if self.data is None:
                    return None
                self.data = {**self.data, "stale": True}
            self.loaded_at = time.monotonic()
            return self.data


def default_loader() -> dict:
    from .sheets import SheetReader
    return SheetReader().load()


def create_app(loader: Callable[[], dict] | None = None, users: dict[str, str] | None = None,
               secret: str | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO)
    users = users if users is not None else load_users()
    secret = secret or os.environ.get("TCM_SECRET")
    if not secret or len(secret) < 32:
        raise RuntimeError("TCM_SECRET должен быть случайной строкой не короче 32 символов")
    if not users:
        log.warning("TCM_USERS пуст — войти будет невозможно")
    cache = DataCache(loader or default_loader, int(float(os.environ.get("TCM_CACHE_MIN", "15")) * 60))
    throttle = Throttle()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(SessionMiddleware, secret_key=secret, session_cookie="tcm_session",
                       max_age=SESSION_DAYS * 86400, same_site="lax",
                       https_only=os.environ.get("TCM_COOKIE_SECURE", "1") != "0")

    @app.middleware("http")
    async def headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "same-origin"
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    def user(request: Request) -> str | None:
        u = request.session.get("user")
        return u if u in users else None

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.get("/login", response_class=HTMLResponse)
    def login_page(request: Request, e: str = ""):
        if user(request):
            return RedirectResponse("./", status_code=303)
        msg = {"1": "Неверный логин или пароль.", "2": "Слишком много попыток. Подождите 15 минут."}.get(e, "")
        return HTMLResponse(LOGIN_HTML.replace("{{msg}}", msg))

    @app.post("/login")
    def login(request: Request, login: str = Form(""), password: str = Form("")):
        # Попытки считаем по паре «адрес + логин». За туннелем (Tailscale) все запросы
        # могут приходить с одного адреса — блокировка только по адресу закрыла бы вход всем.
        # Адрес из X-Forwarded-For uvicorn подставляет лишь для доверенных прокси (FORWARDED_ALLOW_IPS).
        ip = request.client.host if request.client else "?"
        key = login.strip().lower()
        tkey = f"{ip}|{key}"
        if throttle.blocked(tkey):
            return RedirectResponse("login?e=2", status_code=303)
        stored = users.get(key)
        if stored and check_password(password, stored):
            throttle.reset(tkey)
            request.session.clear()
            request.session["user"] = key
            return RedirectResponse("./", status_code=303)
        throttle.fail(tkey)
        return RedirectResponse("login?e=1", status_code=303)

    @app.get("/logout")
    def logout(request: Request):
        request.session.clear()
        return RedirectResponse("login", status_code=303)

    @app.get("/api/data")
    def api_data(request: Request):
        if not user(request):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        data = cache.get()
        if data is None:
            return JSONResponse({"error": "Таблица недоступна"}, status_code=503)
        return JSONResponse(data)

    @app.get("/")
    def index(request: Request):
        if not user(request):
            return RedirectResponse("login", status_code=303)
        return FileResponse(WEB / "index.html", media_type="text/html")

    @app.get("/app.js")
    def app_js(request: Request):
        if not user(request):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return FileResponse(WEB / "app.js", media_type="application/javascript")

    return app


LOGIN_HTML = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Tashkent City Mall — вход</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Montserrat:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#FFFFFF;--bg2:#F6F3F2;--ink:#22292F;--ink2:#5E676E;--line2:#B7B7B7;--terra:#B4806D;--down:#B03F33}
@media (prefers-color-scheme: dark){:root{--bg:#12181D;--bg2:#1A2229;--ink:#EEEAE8;--ink2:#A5ADB3;--line2:#4A555E;--down:#F28F82}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
  font:400 15px/1.45 "Montserrat","Cera Pro",Arial,sans-serif;padding:24px 16px}
form{width:min(100%,360px)}
h1{font:500 32px/1.1 "Cormorant Garamond","Kudryashev Display",Georgia,serif;margin:0 0 6px}
p{color:var(--ink2);margin:0 0 22px;font-size:13px}
label{display:block;font-weight:600;font-size:12px;color:var(--terra);margin:14px 0 6px}
input{width:100%;height:50px;border:1px solid var(--line2);border-radius:14px;background:var(--bg2);color:var(--ink);padding:0 14px;font:400 16px inherit}
input:focus{outline:0;border-color:var(--terra)}
button{margin-top:22px;width:100%;height:50px;border:0;border-radius:14px;background:var(--ink);color:var(--bg);font:600 15px inherit;cursor:pointer}
.err{color:var(--down);font-size:13px;margin:14px 0 0;min-height:1em}
</style></head><body>
<form method="post" action="login">
  <h1>Tashkent City Mall</h1>
  <p>Аналитика для руководства</p>
  <label for="l">Логин</label><input id="l" name="login" autocomplete="username" autocapitalize="off" required>
  <label for="p">Пароль</label><input id="p" name="password" type="password" autocomplete="current-password" required>
  <div class="err">{{msg}}</div>
  <button type="submit">Войти</button>
</form></body></html>"""
