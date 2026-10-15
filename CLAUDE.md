# TCM Analytics

Мобильная страница для руководства Tashkent City Mall. Данные берутся из Google-таблицы «Реестр 26» через сервисный аккаунт. Что внутри и откуда цифры — `README.md`.

- `server/tcm/model.py` — разбор вкладок таблицы → JSON для страницы (всё в $, помесячно)
- `server/tcm/sheets.py` — чтение таблицы, `server/tcm/app.py` — сервер (FastAPI, вход по паролю)
- `web/index.html`, `web/app.js` — страница
- `deploy/` — docker-compose с Caddy (HTTPS), unit-файл systemd

**Если тебя попросили задеплоить или обновить на сервере — следуй `DEPLOY.md` шаг за шагом.**

Правила:
- Секреты (`secrets/sa.json`, `.env`) не выводить в терминал, не коммитить, не класть в образ.
- Реальные данные таблицы (выгрузки, JSON из `/api/data`) не коммитить: это коммерческая информация.
- Тесты: `cd server && pip install -r requirements-dev.txt && python -m pytest`.
