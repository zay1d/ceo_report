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
  TCM_BASE_PATH       префикс пути, если страница опубликована не в корне (например /ceo
                      за tailscale serve --set-path /ceo: Tailscale срезает префикс)
  TCM_STATE_DIR       папка, куда сервер пишет комментарии (comments.json); без неё комментарии выключены
  TCM_MANAGERS        логины с ролью «ответственный» через запятую: комментарий руководства видят, но не пишут
  MALLSENSE_XTOKEN,   ключи MallSense: трафик ТРЦ и зон по счётчикам (без них — из вкладки
  MALLSENSE_APP_KEY   «Заполняемость Mall»), см. mallsense.py
"""
from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, Form, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from .auth import Throttle, check_password, load_users
from .comments import KINDS, MAX_OBJ, MAX_TEXT, CommentStore, load_managers

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
    from .mallsense import enrich_safe
    from .sheets import SheetReader
    return enrich_safe(SheetReader().load())


def create_app(loader: Callable[[], dict] | None = None, users: dict[str, str] | None = None,
               secret: str | None = None, state_dir: str | None = None,
               managers: set[str] | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO)
    users = users if users is not None else load_users()
    secret = secret or os.environ.get("TCM_SECRET")
    if not secret or len(secret) < 32:
        raise RuntimeError("TCM_SECRET должен быть случайной строкой не короче 32 символов")
    if not users:
        log.warning("TCM_USERS пуст — войти будет невозможно")
    cache = DataCache(loader or default_loader, int(float(os.environ.get("TCM_CACHE_MIN", "15")) * 60))
    throttle = Throttle()
    comments = CommentStore(state_dir if state_dir is not None else os.environ.get("TCM_STATE_DIR") or None)
    managers = managers if managers is not None else load_managers()

    @asynccontextmanager
    async def lifespan(_app):
        # читаем таблицу сразу после запуска, чтобы первый вход не ждал ~15 секунд
        if os.environ.get("TCM_WARMUP", "1") != "0":
            threading.Thread(target=cache.get, daemon=True).start()
        yield

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    base = "/" + os.environ.get("TCM_BASE_PATH", "").strip("/")
    base = "" if base == "/" else base

    def to(path: str) -> RedirectResponse:
        return RedirectResponse(f"{base}/{path}", status_code=303)

    def with_base(html: str) -> str:
        # <base> делает все относительные ссылки страницы (api/data, login, app.js) верными
        # и для «/ceo», и для «/ceo/»
        return html.replace("<head>", f'<head><base href="{base}/">', 1)

    index_html = with_base((WEB / "index.html").read_text(encoding="utf-8"))
    login_html = with_base(LOGIN_HTML)

    app.add_middleware(SessionMiddleware, secret_key=secret, session_cookie="tcm_session", path=f"{base}/",
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
            return to("")
        msg = {"1": "Неверный логин или пароль.", "2": "Слишком много попыток. Подождите 15 минут."}.get(e, "")
        return HTMLResponse(login_html.replace("{{msg}}", msg))

    @app.post("/login")
    def login(request: Request, login: str = Form(""), password: str = Form("")):
        # Попытки считаем по паре «адрес + логин». За туннелем (Tailscale) все запросы
        # могут приходить с одного адреса — блокировка только по адресу закрыла бы вход всем.
        # Адрес из X-Forwarded-For uvicorn подставляет лишь для доверенных прокси (FORWARDED_ALLOW_IPS).
        ip = request.client.host if request.client else "?"
        key = login.strip().lower()
        tkey = f"{ip}|{key}"
        if throttle.blocked(tkey):
            return to("login?e=2")
        stored = users.get(key)
        if stored and check_password(password, stored):
            throttle.reset(tkey)
            request.session.clear()
            request.session["user"] = key
            return to("")
        throttle.fail(tkey)
        return to("login?e=1")

    @app.get("/logout")
    def logout(request: Request):
        request.session.clear()
        return to("login")

    @app.get("/api/data")
    def api_data(request: Request):
        if not user(request):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        data = cache.get()
        if data is None:
            return JSONResponse({"error": "Таблица недоступна"}, status_code=503)
        return JSONResponse(data)

    def role(u: str) -> str:
        return "manager" if u in managers else "management"

    @app.get("/api/comments")
    def get_comments(request: Request, obj: str = ""):
        u = user(request)
        if not u:
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if not comments.enabled:
            return JSONResponse({"error": "хранилище комментариев не настроено"}, status_code=503)
        # оба комментария видят все; писать комментарий руководства может только «руководство» (см. POST)
        return {"role": role(u), "items": comments.get(obj[:MAX_OBJ])}

    @app.post("/api/comments")
    async def post_comment(request: Request):
        u = user(request)
        if not u:
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if not comments.enabled:
            return JSONResponse({"error": "хранилище комментариев не настроено"}, status_code=503)
        # только JSON: обычная форма с чужого сайта так не отправится
        if not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse({"error": "нужен JSON"}, status_code=415)
        try:
            body = await request.json()
            obj, kind, text = str(body["obj"]), str(body["kind"]), str(body.get("text", ""))
        except Exception:
            return JSONResponse({"error": "неверный запрос"}, status_code=400)
        if kind not in KINDS or not obj or len(obj) > MAX_OBJ or len(text) > MAX_TEXT:
            return JSONResponse({"error": "неверный запрос"}, status_code=400)
        if kind == "management" and role(u) != "management":
            return JSONResponse({"error": "только для руководства"}, status_code=403)
        return {"item": comments.put(obj, kind, text, u)}

    @app.get("/fonts.css")
    def fonts():
        # шрифты не секрет: нужны и странице входа; кэшируются браузером на сутки
        return FileResponse(WEB / "fonts.css", media_type="text/css",
                            headers={"Cache-Control": "public, max-age=86400"})

    @app.get("/")
    def index(request: Request):
        if not user(request):
            return to("login")
        return HTMLResponse(index_html)

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
<link rel="stylesheet" href="fonts.css">
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
  <p>Аналитика ТРЦ</p>
  <label for="l">Логин</label><input id="l" name="login" autocomplete="username" autocapitalize="off" required>
  <label for="p">Пароль</label><input id="p" name="password" type="password" autocomplete="current-password" required>
  <div class="err">{{msg}}</div>
  <button type="submit">Войти</button>
</form></body></html>"""
