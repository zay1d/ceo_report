# TCM Analytics

Страница для руководства Tashkent City Mall (телефон и компьютер). Данные берутся из Google-таблицы «Реестр 26» через сервисный аккаунт. Что внутри и откуда цифры — `README.md`.

- `server/tcm/model.py` — разбор вкладок таблицы → JSON для страницы (всё в $, помесячно)
- `server/tcm/mallsense.py` — трафик ТРЦ и зон из MallSense API (ключи `MALLSENSE_XTOKEN`, `MALLSENSE_APP_KEY`; без них — из таблицы). Справка по API — `~/Desktop/Проекты Claude/SNRG API/MallSense_API.md`
- `server/tcm/tenant_report.py` + `report/` — PDF «Отчёт по арендатору» для «Выгрузить анализ»: пакет Hyper Partners от 09.11.2026 (три листа A3, лист 3 — `compare.js`), модули в `report/`, standalone собирается `cd report && python build.py`. Логику отчёта не править (см. `report/README-INTEGRATION.md`); исключение — наши правки подписей и шкал графиков, помечены `TCM:` в `charts.js`/`final.js`/`compare.js`; при замене пакета — новый пакет отдельным коммитом, затем перенести `git diff 94b56fe -- report/` (94b56fe — пакет 09.11 как есть). Данные листов 1–2 — модель дашборда TCM (`TCM_TR_DATA`), листа 3 (чеки, менеджер, превышение порога) — наша модель страницы; печать — Chrome без окна
- `server/tcm/sheets.py` — чтение таблицы, `server/tcm/app.py` — сервер (FastAPI, вход по паролю), `server/tcm/comments.py` — комментарии (JSON-файл в `TCM_STATE_DIR`, роли через `TCM_MANAGERS`)
- `web/index.html`, `web/app.js`, `web/fonts.css` — страница (мобильный вид по умолчанию, десктоп — `@media (min-width:1024px)`). Основа — макет команды «commerce app» (16.10.2026), переведённый на помесячные данные в $
- `deploy/` — docker-compose (приложение на 127.0.0.1:8000; Caddy — профиль для своего домена), unit-файл systemd. Наружу страница выводится через Tailscale serve/funnel

**Продакшн:** https://tcm-events.tail226d37.ts.net/ceo — корпоративная ВМ `hostingtg`, сервис `ceo-report` (пользователь `svc-ceo`, `/opt/ceo-report`, `127.0.0.1:8012`), Tailscale Funnel по пути `/ceo`. На этой же ВМ живут другие сервисы: их и чужие маршруты Funnel не трогать.

**Обновить продакшн** — `DEPLOY.md`, раздел «Текущий продакшн». **Новый сервер** — шаги 0–6 там же.

Правила:
- Секреты (`secrets/sa.json`, `.env`) не выводить в терминал, не коммитить, не класть в образ.
- Реальные данные таблицы (выгрузки, JSON из `/api/data`) и комментарии (`state/`) не коммитить: это коммерческая информация.
- Тесты: `cd server && pip install -r requirements-dev.txt && python -m pytest`.
