"""Чтение «Реестр 26» через Google Sheets API сервисным аккаунтом (только чтение).

Ключ берётся из переменных окружения, в репозитории его нет:
  TCM_SA_KEY_FILE  — путь к JSON-ключу, или
  TCM_SA_KEY_JSON  — содержимое JSON-ключа одной строкой.
  TCM_SHEET_ID     — ID таблицы.
"""
from __future__ import annotations

import datetime as dt
import json
import os

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from . import model

API = "https://sheets.googleapis.com/v4/spreadsheets"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
BRAND_TAB_RANGE = "A1:BZ40"  # карточка бренда целиком помещается в первые 40 строк
CHUNK = 60  # вкладок брендов за один запрос batchGet


class SheetReader:
    def __init__(self, sheet_id: str | None = None, key_file: str | None = None, key_json: str | None = None):
        self.sheet_id = sheet_id or os.environ["TCM_SHEET_ID"]
        key_file = key_file or os.environ.get("TCM_SA_KEY_FILE")
        key_json = key_json or os.environ.get("TCM_SA_KEY_JSON")
        if key_json:
            self.creds = service_account.Credentials.from_service_account_info(json.loads(key_json), scopes=SCOPES)
        elif key_file:
            self.creds = service_account.Credentials.from_service_account_file(key_file, scopes=SCOPES)
        else:
            raise RuntimeError("Не задан ключ сервисного аккаунта: TCM_SA_KEY_FILE или TCM_SA_KEY_JSON")
        self.http = requests.Session()

    def _headers(self):
        if not self.creds.valid:
            self.creds.refresh(Request())
        return {"Authorization": f"Bearer {self.creds.token}"}

    def tab_titles(self) -> list[str]:
        r = self.http.get(f"{API}/{self.sheet_id}", headers=self._headers(),
                          params={"fields": "sheets.properties.title"}, timeout=60)
        r.raise_for_status()
        return [s["properties"]["title"] for s in r.json()["sheets"]]

    def values(self, ranges: list[str]) -> list[list]:
        params = [("ranges", x) for x in ranges] + [
            ("valueRenderOption", "UNFORMATTED_VALUE"), ("dateTimeRenderOption", "FORMATTED_STRING")]
        r = self.http.get(f"{API}/{self.sheet_id}/values:batchGet", headers=self._headers(), params=params, timeout=120)
        r.raise_for_status()
        return [v.get("values", []) for v in r.json()["valueRanges"]]

    def load(self) -> dict:
        titles = self.tab_titles()
        main = [model.TAB_REGISTRY, model.TAB_TURNOVER, model.TAB_FX, model.TAB_TRAFFIC]
        missing = [t for t in main[:3] if t not in titles]
        if missing:
            raise RuntimeError(f"В таблице нет вкладок: {missing}")
        main = [t for t in main if t in titles]
        tabs = dict(zip(main, self.values([q(t) for t in main])))

        # Вкладки брендов — только те, что могут понадобиться (по названиям из реестра).
        wanted = set()
        for b in model.parse_registry(tabs[model.TAB_REGISTRY]):
            wanted |= b.names | {model.re.sub(r"\s+(NEW|OLD)$", "", n) for n in b.names}
        brand_titles = [t for t in titles if model.norm(t) in wanted]
        brand_tabs = {}
        for i in range(0, len(brand_titles), CHUNK):
            part = brand_titles[i:i + CHUNK]
            brand_tabs.update(zip(part, self.values([f"{q(t)}!{BRAND_TAB_RANGE}" for t in part])))

        now = dt.datetime.now(dt.timezone(dt.timedelta(hours=5)))  # Ташкент
        return model.build(tabs, brand_tabs, today=now.date().isoformat(), as_of=now.isoformat(timespec="minutes"))


def q(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"
