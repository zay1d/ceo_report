# Деплой TCM Analytics на сервер — инструкция для Claude

Задача: поднять страницу для руководства Tashkent City Mall на этом сервере по HTTPS с входом по паролю. Данные страница берёт из Google-таблицы «Реестр 26» через сервисный аккаунт. Что внутри проекта — в `README.md`.

Работай по шагам ниже. Каждый шаг проверяй командой из раздела «Проверка». Если что-то не сходится, остановись и спроси человека, не обходи проблему.

## 0. Правила

- **Ключ сервисного аккаунта (`secrets/sa.json`) — секрет.**
  - Не выводи его содержимое в терминал (`cat`, `less`, `head`).
  - Не копируй его внутрь Docker-образа и не коммить в git.
  - Можно смотреть только поле адреса: `python3 -c "import json;print(json.load(open('secrets/sa.json'))['client_email'])"`.
- **Пароли пользователей** не записывай в файлы и логи. В `.env` попадают только хэши.
- **Порт 8000 наружу не открывай.** Снаружи доступны только 80 и 443 через Caddy.
- **Не отключай `TCM_COOKIE_SECURE`** в рабочем режиме: без HTTPS вход ломается, это ожидаемо.
- **Перед действиями, которые меняют систему, спроси разрешения у человека**: установка пакетов, открытие портов в firewall, перезапуск чужих сервисов, занятие портов 80/443.

## 1. Спроси у человека (одним сообщением)

1. **Домен** для страницы, например `analytics.tcmall.uz`. A-запись домена должна указывать на IP этого сервера. Если домена нет, см. «Без домена» в конце.
2. **Логины и пароли руководителей.** Попроси выбрать надёжные пароли или предложи сгенерировать: `python3 -c "import secrets;print(secrets.token_urlsafe(12))"`.
3. **Где ключ сервисного аккаунта.** Если `secrets/sa.json` ещё нет, попроси загрузить файл на сервер. Ключ `sheet-reader@health-cheak.iam.gserviceaccount.com` или новый — если ключ выпускали заново после того, как он засветился.
4. **Можно ли ставить Docker**, если его нет. Если нельзя, используй «Вариант Б».

## 2. Подготовка (общая для обоих вариантов)

```bash
# проект лежит в /opt/tcm-analytics (если распакован в другое место — перенеси или поправь пути ниже)
cd /opt/tcm-analytics
cat /etc/os-release | head -3; uname -m
ls -l secrets/sa.json && chmod 600 secrets/sa.json
python3 -c "import json;print(json.load(open('secrets/sa.json'))['client_email'])"
```

**DNS.** Домен должен указывать на этот сервер:
```bash
curl -s https://ifconfig.me; echo; getent ahostsv4 "$DOMAIN" | head -1
```
IP должны совпасть. Если не совпадают, скажи человеку, что нужно поправить A-запись, и жди.

**Порты 80 и 443** должны быть свободны:
```bash
sudo ss -ltnp | grep -E ':(80|443)\s'
```
Если они заняты другим веб-сервером (nginx, apache), не останавливай его сам. Предложи человеку один из путей:
- добавить в существующий nginx `server` для домена с `proxy_pass http://127.0.0.1:8000`, а Caddy не ставить;
- освободить порты.

**Firewall:** `sudo ufw status`. Если ufw включён, нужно разрешить 80 и 443 (с согласия человека).

**Исходящий доступ** к Google: `curl -sI https://sheets.googleapis.com | head -1` должен вернуть любой HTTP-ответ, а не таймаут.

**Файл `.env`:**
```bash
cp .env.example .env && chmod 600 .env
python3 -c "import secrets;print(secrets.token_hex(32))"   # → TCM_SECRET
```
Заполни в `.env`:
- `TCM_DOMAIN` — домен;
- `TCM_SECRET` — строка из команды выше;
- `TCM_USERS` — список `логин:хэш` через запятую.

Хэш пароля считается так:
- без Docker: `cd server && python3 -m tcm.auth 'пароль'` (нужен только Python 3.10+, без зависимостей);
- с Docker: `docker compose -f deploy/docker-compose.yml run --rm --no-deps app python -m tcm.auth 'пароль'`.

`TCM_SHEET_ID` уже заполнен. Логины пиши строчными буквами.

## 3А. Вариант А — Docker (предпочтительно)

```bash
docker --version && docker compose version
```
Если Docker не установлен, установи с разрешения человека: `curl -fsSL https://get.docker.com | sh`.

```bash
cd /opt/tcm-analytics/deploy
docker compose build
# проверка доступа к таблице ДО запуска (ключ, доступ, API):
docker compose run --rm --no-deps app python -m tcm.check
docker compose up -d
docker compose ps
docker compose logs --tail=50 caddy app
```

`tcm.check` должен напечатать `OK: месяцы 2024-02 … 2026-xx, брендов в выборке ~240`. Если вывод другой, смотри «Если что-то не так».

**Обновление** на новую версию: заменить файлы проекта (кроме `.env` и `secrets/`), затем выполнить `docker compose up -d --build`.

## 3Б. Вариант Б — без Docker (systemd + Caddy)

```bash
sudo useradd -r -s /usr/sbin/nologin tcm || true
cd /opt/tcm-analytics
sudo apt-get update && sudo apt-get install -y python3-venv     # Debian/Ubuntu
python3 -m venv venv && venv/bin/pip install -r server/requirements.txt
sudo chown -R tcm:tcm /opt/tcm-analytics && sudo chmod 600 .env secrets/sa.json

# проверка доступа к таблице:
sudo -u tcm bash -c 'cd server && set -a && . ../.env && set +a && TCM_SA_KEY_FILE=../secrets/sa.json ../venv/bin/python -m tcm.check'

sudo cp deploy/tcm-analytics.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now tcm-analytics
systemctl status tcm-analytics --no-pager; curl -s 127.0.0.1:8000/healthz
```

**HTTPS через Caddy.** Установка: https://caddyserver.com/docs/install#debian-ubuntu-raspbian. Затем `/etc/caddy/Caddyfile`:

```
analytics.example.uz {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	reverse_proxy 127.0.0.1:8000
}
```

Перезапуск Caddy: `sudo systemctl reload caddy`.

Если на сервере уже есть nginx, вместо Caddy используй `proxy_pass http://127.0.0.1:8000;` с заголовками `X-Forwarded-For` и `X-Forwarded-Proto`. Сертификат — certbot.

## 4. Проверка (обязательно перед отчётом человеку)

```bash
D=https://$DOMAIN
curl -sS -o /dev/null -w "%{http_code}\n" $D/healthz                 # 200
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" $D/        # 303 → /login
curl -sS -o /dev/null -w "%{http_code}\n" $D/api/data                 # 401 без входа
# вход тестовым пользователем (пароль спроси у человека или создай временного и потом удали):
curl -sS -c /tmp/tcm.cj -o /dev/null -w "%{http_code} %{redirect_url}\n" -d "login=ЛОГИН&password=ПАРОЛЬ" $D/login   # 303 → ./
curl -sS -b /tmp/tcm.cj $D/api/data | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['months'][-1],len(d['brands']),'stale=',d['stale'])"
rm -f /tmp/tcm.cj
curl -sI http://$DOMAIN | head -3                                     # редирект на https
```

Порт 8000 не должен быть доступен снаружи. Проверь с другой машины или так: `ss -ltn | grep 8000`. В варианте А его вообще не должно быть на хосте, в варианте Б он слушает только `127.0.0.1`.

## 5. Отчёт человеку

Коротко сообщи:
- адрес страницы;
- какие логины созданы (без паролей);
- результат `tcm.check`: последний месяц и число брендов;
- что проверено из шага 4;
- как добавить пользователя или обновить версию.

Напомни выпустить новый ключ сервисного аккаунта, если старый передавался через чат или мессенджер. Новый файл кладётся в `secrets/sa.json`, затем перезапуск:
- вариант А: `docker compose restart app`;
- вариант Б: `systemctl restart tcm-analytics`.

## Если что-то не так

| Симптом | Причина и что делать |
|---|---|
| `tcm.check`: 403 / PERMISSION_DENIED | Таблица не открыта для `client_email`, или в проекте Google Cloud не включён Sheets API. Попроси человека открыть «Реестр 26» на чтение для этого адреса. |
| `tcm.check`: 404 | Неверный `TCM_SHEET_ID`. |
| `tcm.check`: «нет вкладок …» / «нет колонки …» | В таблице переименовали вкладку или колонку. Сообщи человеку точный текст ошибки. Названия задаются в `server/tcm/model.py`. |
| Caddy не получает сертификат | DNS ещё не указывает на сервер, или закрыт порт 80/443. Смотри `docker compose logs caddy`. |
| После входа снова страница входа | Сайт открыт по http, а не по https (cookie `Secure`), или неверный `TCM_SECRET` после перезапуска. Проверь, что открывается `https://`. |
| «Неверный логин или пароль» при верном пароле | Хэш в `TCM_USERS` повреждён при копировании. Пересчитай его. Логин сравнивается без учёта регистра. |
| «Слишком много попыток» | 5 неудачных входов с одного IP — блокировка на 15 минут. Сброс — перезапуск `app`. |
| Страница пишет «таблица недоступна, показаны последние данные» | Google временно не ответил. Смотри логи `app`. Данные обновятся при следующем успешном чтении (раз в `TCM_CACHE_MIN` минут). |

## Без домена

Let's Encrypt не выдаёт сертификаты на голый IP. Варианты для человека:
- **(лучше)** завести поддомен с A-записью на сервер;
- временно использовать самоподписанный сертификат. В `deploy/Caddyfile` замени первую строку на `https://<IP> {` и добавь внутрь блока `tls internal`. Браузер покажет предупреждение, и на телефонах руководителей это неудобно.

## Управление пользователями

1. Добавить или удалить пару `логин:хэш` в `TCM_USERS` в `.env`.
2. Перезапустить приложение:
   - вариант А: `docker compose up -d app`;
   - вариант Б: `systemctl restart tcm-analytics`.

Удалённый пользователь теряет доступ сразу после перезапуска.
