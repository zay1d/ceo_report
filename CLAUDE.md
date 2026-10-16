# TCM Analytics

Страница для руководства Tashkent City Mall (телефон и компьютер). Данные берутся из Google-таблицы «Реестр 26» через сервисный аккаунт. Что внутри и откуда цифры — `README.md`.

- `server/tcm/model.py` — разбор вкладок таблицы → JSON для страницы (всё в $, помесячно)
- `server/tcm/sheets.py` — чтение таблицы, `server/tcm/app.py` — сервер (FastAPI, вход по паролю), `server/tcm/comments.py` — комментарии (JSON-файл в `TCM_STATE_DIR`, роли через `TCM_MANAGERS`)
- `web/index.html`, `web/app.js`, `web/fonts.css` — страница (мобильный вид по умолчанию, десктоп — `@media (min-width:1024px)`). Основа — макет команды «commerce app» (16.10.2026), переведённый на помесячные данные в $
- `deploy/` — docker-compose (приложение на 127.0.0.1:8000; Caddy — профиль для своего домена), unit-файл systemd. Наружу страница выводится через Tailscale serve/funnel

**Продакшн:** https://tcm-events.tail226d37.ts.net/ceo — корпоративная ВМ `hostingtg`, сервис `ceo-report` (пользователь `svc-ceo`, `/opt/ceo-report`, `127.0.0.1:8012`), Tailscale Funnel по пути `/ceo`. На этой же ВМ живут другие сервисы: их и чужие маршруты Funnel не трогать.

**Обновить продакшн** — `DEPLOY.md`, раздел «Текущий продакшн». **Новый сервер** — шаги 0–6 там же.

Правила:
- Секреты (`secrets/sa.json`, `.env`) не выводить в терминал, не коммитить, не класть в образ.
- Реальные данные таблицы (выгрузки, JSON из `/api/data`) и комментарии (`state/`) не коммитить: это коммерческая информация.
- Тесты: `cd server && pip install -r requirements-dev.txt && python -m pytest`.
