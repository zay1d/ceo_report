"""Посещаемость из MallSense (счётчики Xovis): весь ТРЦ и зоны.

Переменные окружения (те же имена, что у сервисов посещаемости на ВМ):
  MALLSENSE_XTOKEN   постоянный токен (заголовок x-token)
  MALLSENSE_APP_KEY  ключ приложения (заголовок x-app-key)
Без них трафик берётся из вкладки «Заполняемость Mall», как раньше.

Что добавляется к /api/data:
  mallTraffic  — вход в ТРЦ по месяцам (MallSense; где его нет — значение из таблицы)
  zoneTraffic  — {зона: [вход по месяцам]} для зон, которые есть в реестре
  zones        — средний месячный трафик зоны (вес для «Отдачи на трафик»), если MallSense покрыл все зоны
  live         — вход в ТРЦ: сегодня, вчера, текущий месяц и те же дни год назад
  trafficSource — «mallsense» или «sheet»
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import re

import requests

from .model import parse_zone

log = logging.getLogger("tcm.mallsense")

API = "https://api.mallsense.ae"
LOCATION = 558      # pl_id ТРЦ
MALL_OBJ = 27283    # объект «ТРЦ целиком»
METRIC = "fpc_sum_pass_count_in_wh"  # вход посетителей за рабочие часы
MAX_IDS = 200       # объектов в одном запросе


class MallSense:
    def __init__(self, token: str | None = None, app_key: str | None = None, session=None):
        self.token = token if token is not None else os.environ.get("MALLSENSE_XTOKEN", "")
        self.app_key = app_key if app_key is not None else os.environ.get("MALLSENSE_APP_KEY", "")
        self.http = session or requests.Session()

    @property
    def enabled(self) -> bool:
        return bool(self.token and self.app_key)

    def _headers(self) -> dict:
        return {"x-token": self.token, "x-app-key": self.app_key, "Content-Type": "application/json"}

    def zones(self) -> dict[int, str]:
        """Активные зоны локации: {id: имя}, имя в виде MallSense («L1_Main atrium»)."""
        r = self.http.get(f"{API}/structure-service/v1/project_locations/{LOCATION}/core/elements_admin_data_objects/",
                          headers=self._headers(), timeout=60)
        r.raise_for_status()
        d = r.json()
        items = d if isinstance(d, list) else d.get("result") or []
        return {int(o["id"]): str(o["name"]) for o in items
                if o.get("object_type") == "zone" and o.get("is_active")}

    def dynamics(self, obj_ids: list[int], start: str, end: str, freq: str | None) -> dict[int, dict[str, float]]:
        """Вход по объектам: {id: {«YYYY-MM-DDTHH:MM»: значение}}; пустые интервалы пропускаются."""
        out: dict[int, dict[str, float]] = {}
        for i in range(0, len(obj_ids), MAX_IDS):
            body = {"input_parameters": {"alias": None, "metric": METRIC, "obj_ids": obj_ids[i:i + MAX_IDS],
                                         "time_range": [start, end], "time_freq": freq}}
            r = self.http.post(f"{API}/core-data-provider/v1/metric_dynamics", json=body,
                               headers=self._headers(), timeout=120)
            r.raise_for_status()
            d = r.json()
            if d.get("error"):
                raise RuntimeError(f"MallSense: {d['error']}")
            for res in d.get("result") or []:
                objs = (res.get("context") or {}).get("data_objects") or []
                if not objs:
                    continue
                series = out.setdefault(int(objs[0]["id"]), {})
                for it in res.get("items") or []:
                    if it.get("value") is not None:
                        series[str(it["time"])[:16]] = float(it["value"])
        return out


def zone_name(ms_name: str) -> str:
    """«L1_Main atrium» → «L1 Main atrium», «L3_Foodcorte» → «L3 Foodcourt» — как зоны в реестре."""
    s = re.sub(r"[_\s]+", " ", ms_name).strip()
    name, _ = parse_zone(s)
    return name or s


def month_start(d: dt.date) -> dt.date:
    return d.replace(day=1)


def year_ago(d: dt.date) -> dt.date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # 29 февраля
        return d.replace(year=d.year - 1, day=28)


def enrich(data: dict, client: MallSense, now: dt.datetime) -> dict:
    """Подмешивает данные MallSense в набор данных страницы. Исключения пробрасывает."""
    months = data["months"]
    today = now.date()
    yday = today - dt.timedelta(days=1)

    zmap = {i: zone_name(n) for i, n in client.zones().items()}
    ids = [MALL_OBJ] + sorted(zmap)
    last_day = min(yday, (dt.date.fromisoformat(months[-1] + "-01") + dt.timedelta(days=31)).replace(day=1)
                   - dt.timedelta(days=1))
    monthly = client.dynamics(ids, months[0] + "-01", last_day.isoformat(), "MS") if last_day.isoformat() >= months[0] else {}
    by_month = {i: {k[:7]: v for k, v in s.items()} for i, s in monthly.items()}

    mall = by_month.get(MALL_OBJ, {})
    sheet = data.get("mallTraffic") or [None] * len(months)
    data["mallTraffic"] = [mall.get(mk) or old for mk, old in zip(months, sheet)]

    zt: dict[str, list] = {}
    for i, name in zmap.items():
        s = by_month.get(i)
        if not s:
            continue
        row = [s.get(mk) for mk in months]
        if name in zt:  # две зоны MallSense с одним именем — складываем
            row = [(a or 0) + (b or 0) if (a is not None or b is not None) else None for a, b in zip(zt[name], row)]
        zt[name] = row
    reg = set(data.get("zones") or {})
    data["zoneTraffic"] = {z: v for z, v in zt.items() if z in reg}
    if reg and all(any(data["zoneTraffic"].get(z) or []) for z in reg):
        # вес зоны для «Отдачи на трафик» — средний месячный вход по счётчикам вместо разового замера
        w = {}
        for z in reg:
            vals = [v for v in data["zoneTraffic"][z] if v]
            w[z] = round(sum(vals) / len(vals))
        data["zones"] = dict(sorted(w.items()))
        data["zoneWeights"] = "mallsense"
    missing = sorted(reg - set(data["zoneTraffic"]))
    if missing:
        log.warning("MallSense: нет зон реестра %s", missing)

    data["live"] = live(client, today, now)
    data["trafficSource"] = "mallsense"
    return data


def live(client: MallSense, today: dt.date, now: dt.datetime) -> dict:
    """Сегодня (по часам), вчера, текущий месяц по вчера и те же дни год назад."""
    yday = today - dt.timedelta(days=1)
    m0 = month_start(yday)
    cur = client.dynamics([MALL_OBJ], m0.isoformat(), yday.isoformat(), "D").get(MALL_OBJ, {})
    ly = client.dynamics([MALL_OBJ], year_ago(m0).isoformat(), year_ago(yday).isoformat(), "D").get(MALL_OBJ, {})
    hours = client.dynamics([MALL_OBJ], today.isoformat(), today.isoformat(), "H").get(MALL_OBJ, {})
    last_h = max((k for k, v in hours.items() if v), default=None)
    return {
        "today": round(sum(hours.values())) if last_h else None,
        "todayTo": (dt.datetime.fromisoformat(last_h) + dt.timedelta(hours=1)).strftime("%H:%M") if last_h else None,
        "date": today.isoformat(),
        "yesterday": cur.get(yday.isoformat() + "T00:00"),
        "yesterdayDate": yday.isoformat(),
        "month": m0.isoformat()[:7],
        "mtd": round(sum(cur.values())) if cur else None,
        "mtdDays": yday.day,
        "mtdLy": round(sum(ly.values())) if ly else None,
        "daily": [[k[:10], v] for k, v in sorted(cur.items())],
        "at": now.isoformat(timespec="minutes"),
    }


def enrich_safe(data: dict, client: MallSense | None = None, now: dt.datetime | None = None) -> dict:
    """Как enrich, но сбой MallSense не ломает страницу: остаются цифры из таблицы."""
    client = client or MallSense()
    if not client.enabled:
        return {**data, "trafficSource": "sheet"}
    now = now or dt.datetime.now(dt.timezone(dt.timedelta(hours=5)))  # Ташкент
    try:
        return enrich(dict(data), client, now)
    except Exception:  # noqa: BLE001 — любая ошибка API: показываем таблицу
        log.exception("MallSense недоступен, трафик — из таблицы")
        return {**data, "trafficSource": "sheet", "trafficError": True}


def main() -> int:
    """python -m tcm.mallsense — проверить доступ к MallSense без запуска сервера."""
    c = MallSense()
    if not c.enabled:
        print("ОШИБКА: не заданы MALLSENSE_XTOKEN и MALLSENSE_APP_KEY")
        return 1
    try:
        z = c.zones()
        today = dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).date()
        y = today - dt.timedelta(days=1)
        d = c.dynamics([MALL_OBJ], y.isoformat(), y.isoformat(), "D").get(MALL_OBJ, {})
    except Exception as e:  # noqa: BLE001
        print(f"ОШИБКА: {type(e).__name__}: {e}")
        return 1
    print(f"OK: зон {len(z)} ({', '.join(sorted(zone_name(n) for n in z.values()))})")
    print(f"    вход в ТРЦ за {y}: {next(iter(d.values()), 'нет данных')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
