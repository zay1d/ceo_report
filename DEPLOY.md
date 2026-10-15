# Деплой TCM Analytics на сервер — инструкция для Claude

Задача: поднять страницу для руководства Tashkent City Mall на этом сервере. Нужен HTTPS и вход по паролю. Данные страница берёт из Google-таблицы «Реестр 26» через сервисный аккаунт. Что внутри проекта — в `README.md`.

**Своего домена нет, на сервере установлен Tailscale.** HTTPS и адрес даёт Tailscale: `https://<имя-сервера>.<tailnet>.ts.net` с настоящим сертификатом. Caddy и домен не нужны. Вариант с доменом — в конце файла.

Работай по шагам. Каждый шаг проверяй. Если что-то не сходится, остановись и спроси человека, не обходи проблему.

## 0. Правила

- **Ключ сервисного аккаунта (`secrets/sa.json`) — секрет.**
  - Не выводи содержимое (`cat`, `less`, `head`).
  - Не клади в Docker-образ и не коммить.
  - Можно смотреть только адрес: `python3 -c "import json;print(json.load(open('secrets/sa.json'))['client_email'])"`.
- **Пароли пользователей** не записывай в файлы и логи. В `.env` попадают только хэши.
- **Приложение слушает только `127.0.0.1:8000`.** Наружу его выводит только Tailscale. Не открывай порт 8000 в firewall и не меняй привязку на `0.0.0.0`.
- **Не отключай `TCM_COOKIE_SECURE`**: адрес `*.ts.net` и так работает по HTTPS.
- **Спроси разрешения у человека** перед тем, как:
  - ставить пакеты;
  - менять текущую настройку `tailscale serve` / `funnel`: на сервере могут уже работать другие сервисы, ничего не сбрасывай (`reset`) без согласия;
  - перезапускать чужие сервисы.

## 1. Спроси у человека (одним сообщением)

1. **Режим доступа:**
   - **Serve (рекомендую, если руководителей немного).** Страница видна только устройствам в вашей сети Tailscale. Каждому руководителю нужно поставить приложение Tailscale на телефон и войти в сеть, для этого вы их приглашаете в админке Tailscale. Снаружи страницу не видно вообще.
   - **Funnel.** Страница открыта в интернете по адресу `https://<сервер>.<tailnet>.ts.net`. Руководителям ничего ставить не нужно. Защищает только пароль страницы. В админке Tailscale должен быть разрешён Funnel для этого сервера.
2. **Логины и пароли руководителей.** Можно предложить сгенерировать пароль: `python3 -c "import secrets;print(secrets.token_urlsafe(12))"`.
3. **Где ключ сервисного аккаунта**, если `secrets/sa.json` ещё нет.
4. **Можно ли ставить Docker**, если его нет. Если нельзя — «Вариант Б».

## 2. Подготовка

```bash
cd /opt/tcm-analytics            # если проект в другом месте — перенеси или поправь пути
cat /etc/os-release | head -3; uname -m
ls -l secrets/sa.json && chmod 600 secrets/sa.json
python3 -c "import json;print(json.load(open('secrets/sa.json'))['client_email'])"
curl -sI https://sheets.googleapis.com | head -1     # исходящий доступ к Google: любой HTTP-ответ, не таймаут
```

**Tailscale:**
```bash
tailscale version
tailscale status | head -5
tailscale status --json | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['Self']['DNSName'])"   # → имя вида srv.tailXXXX.ts.net.
sudo tailscale serve status       # что уже опубликовано (не трогать чужое!)
sudo tailscale funnel status
```

Что проверить:
- **Версия Tailscale** должна быть 1.52 или новее (там синтаксис `serve --bg`). Если старее, предложи человеку обновить.
- **Порт 443 уже занят другим сервисом** в `serve`/`funnel` status. Используй для страницы `--https=8443`: адрес станет `https://<имя>.ts.net:8443`. Funnel допускает только порты 443, 8443 и 10000.
- **HTTPS-сертификаты.** В админке Tailscale (DNS → MagicDNS и HTTPS Certificates) должны быть включены. Если `tailscale serve` пишет про сертификаты, попроси человека включить.
- **Funnel.** В политике (Access controls) должен быть атрибут `funnel` для этого узла. Без него `tailscale funnel` вернёт ошибку со ссылкой: передай её человеку.

**Файл `.env`:**
```bash
cp .env.example .env && chmod 600 .env
python3 -c "import secrets;print(secrets.token_hex(32))"   # → TCM_SECRET
cd server && python3 -m tcm.auth 'пароль' && cd ..          # → хэш для каждого пользователя (нужен только Python 3.10+)
```
Заполни в `.env`:
- `TCM_SECRET`;
- `TCM_USERS` — `логин:хэш` через запятую, логины строчными буквами.

`TCM_DOMAIN` оставь пустым. `TCM_SHEET_ID` уже заполнен.

## 3А. Приложение в Docker (предпочтительно)

```bash
docker --version && docker compose version   # если нет — с разрешения: curl -fsSL https://get.docker.com | sh
cd /opt/tcm-analytics/deploy
docker compose build
docker compose run --rm --no-deps app python -m tcm.check    # доступ к таблице ДО запуска
docker compose up -d                                         # БЕЗ --profile caddy
docker compose ps
curl -s 127.0.0.1:8000/healthz                               # {"ok":true}
```

`tcm.check` должен напечатать `OK: месяцы 2024-02 … 2026-xx, брендов в выборке ~240`. Порт `8000` опубликован только на `127.0.0.1`, это задано в `deploy/docker-compose.yml`.

**Обновление:** заменить файлы проекта (кроме `.env` и `secrets/`), затем `docker compose up -d --build`.

## 3Б. Приложение без Docker (systemd)

```bash
sudo useradd -r -s /usr/sbin/nologin tcm || true
cd /opt/tcm-analytics
sudo apt-get update && sudo apt-get install -y python3-venv     # Debian/Ubuntu
python3 -m venv venv && venv/bin/pip install -r server/requirements.txt
sudo chown -R tcm:tcm /opt/tcm-analytics && sudo chmod 600 .env secrets/sa.json
sudo -u tcm bash -c 'cd server && set -a && . ../.env && set +a && TCM_SA_KEY_FILE=../secrets/sa.json ../venv/bin/python -m tcm.check'
sudo cp deploy/tcm-analytics.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now tcm-analytics
systemctl status tcm-analytics --no-pager; curl -s 127.0.0.1:8000/healthz
```

## 4. Публикация через Tailscale

Выбери команду по режиму из шага 1. Если 443 занят, добавь `--https=8443`.

```bash
# Serve — только для устройств в сети Tailscale:
sudo tailscale serve --bg 8000

# или Funnel — публично в интернете:
sudo tailscale funnel --bg 8000

sudo tailscale serve status      # должно показать https://<имя>.ts.net → proxy http://127.0.0.1:8000
```

Настройка с `--bg` сохраняется и переживает перезагрузку. Отключить её можно так (только то, что добавил сам): `sudo tailscale serve --https=443 off` или `sudo tailscale funnel --https=443 off`, с нужным портом.

## 5. Проверка (обязательно перед отчётом)

```bash
D=https://$(tailscale status --json | python3 -c "import json,sys;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")   # + ":8443", если публиковал на 8443
curl -sS -o /dev/null -w "%{http_code}\n" $D/healthz                 # 200 (первый запрос может идти несколько секунд — выпуск сертификата)
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" $D/        # 303 → /login
curl -sS -o /dev/null -w "%{http_code}\n" $D/api/data                 # 401 без входа
curl -sS -c /tmp/tcm.cj -o /dev/null -w "%{http_code} %{redirect_url}\n" -d "login=ЛОГИН&password=ПАРОЛЬ" $D/login   # 303 → ./
curl -sS -b /tmp/tcm.cj $D/api/data | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['months'][-1],len(d['brands']),'stale=',d['stale'])"
rm -f /tmp/tcm.cj
ss -ltn | grep ':8000'      # должно быть только 127.0.0.1:8000
```

Для Funnel попроси человека открыть адрес с телефона **через мобильный интернет, без Tailscale**: так проверяется публичный доступ. Для Serve пусть откроет с устройства, где включён Tailscale.

## 6. Отчёт человеку

Коротко сообщи:
- адрес страницы;
- режим (Serve или Funnel);
- какие логины созданы (без паролей);
- результат `tcm.check`: последний месяц и число брендов;
- что проверено из шага 5.

Для Serve напиши, что каждому руководителю нужно:
1. установить Tailscale (App Store / Google Play);
2. войти по приглашению из админки Tailscale;
3. открыть адрес;
4. добавить его на экран «Домой».

Напомни выпустить новый ключ сервисного аккаунта, если старый передавался через чат или мессенджер. Новый файл кладётся в `secrets/sa.json`, затем перезапуск:
- вариант 3А: `docker compose restart app`;
- вариант 3Б: `systemctl restart tcm-analytics`.

## Если что-то не так

| Симптом | Причина и что делать |
|---|---|
| `tcm.check`: 403 / PERMISSION_DENIED | Таблица не открыта для `client_email`, или в проекте Google Cloud не включён Sheets API. Попроси человека открыть «Реестр 26» на чтение для этого адреса. |
| `tcm.check`: 404 | Неверный `TCM_SHEET_ID`. |
| `tcm.check`: «нет вкладок …» / «нет колонки …» | В таблице переименовали вкладку или колонку. Сообщи человеку точный текст ошибки. Названия задаются в `server/tcm/model.py`. |
| `tailscale serve`: ошибка про HTTPS / certificates | В админке Tailscale не включены MagicDNS и HTTPS Certificates. |
| `tailscale funnel`: «Funnel not available» / ссылка на политику | В Access controls нет `nodeAttrs` с `funnel` для этого узла. Передай человеку ссылку из ошибки. |
| Адрес `*.ts.net` не открывается с телефона (Serve) | На телефоне не включён Tailscale, или телефон не в той же сети (tailnet). |
| После входа снова страница входа | Страница открыта не по `https://`, или поменялся `TCM_SECRET`. |
| «Неверный логин или пароль» при верном пароле | Хэш в `TCM_USERS` повреждён при копировании. Пересчитай его. Логин сравнивается без учёта регистра. |
| «Слишком много попыток» | 5 неудачных входов в этот логин с одного адреса — блокировка на 15 минут. Сброс — перезапуск приложения. |
| Страница пишет «таблица недоступна, показаны последние данные» | Google временно не ответил. Смотри логи приложения. Данные обновятся при следующем чтении (раз в `TCM_CACHE_MIN` минут). |

## Управление пользователями

1. Добавить или удалить `логин:хэш` в `TCM_USERS` в `.env`.
2. Перезапустить приложение:
   - вариант 3А: `docker compose up -d app`;
   - вариант 3Б: `systemctl restart tcm-analytics`.

## Если появится свой домен (вместо Tailscale)

1. A-запись домена — на публичный IP сервера. Порты 80 и 443 открыты и свободны.
2. В `.env` указать `TCM_DOMAIN=<домен>`.
3. Выполнить `cd deploy && docker compose --profile caddy up -d --build`. Caddy сам получит и будет продлевать сертификат Let's Encrypt.
4. Без Docker поставить Caddy (https://caddyserver.com/docs/install) и прописать в `/etc/caddy/Caddyfile`:
   ```
   <домен> {
   	encode zstd gzip
   	reverse_proxy 127.0.0.1:8000
   }
   ```
5. Публикацию в Tailscale после этого можно снять, но только с согласия человека.
