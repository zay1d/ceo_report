"""PDF «Отчёт по арендатору» (шаблон Hyper Partners, папка report/) для кнопки «Выгрузить анализ».

Данные — модель дашборда TCM (`model.json` и `raw_dump.json`, их раз в час обновляет
tcm-dashboard на той же ВМ). Перевод модели в формат отчёта — перенос gen_tenant_report.py
из проекта health check: контракты из report/README-INTEGRATION.md, логику самого отчёта
(final.js, charts.js) не трогаем.

PDF печатает Chrome без окна (--print-to-pdf): два листа A4, альбомная, как при печати отчёта.

Переменные окружения:
  TCM_TR_DATA   папка с model.json и raw_dump.json (на ВМ: /opt/tcm-dashboard/app/data)
  TCM_CHROME    путь к Chrome/Chromium (по умолчанию ищется google-chrome, chromium)
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import unicodedata
from collections import OrderedDict
from datetime import date
from pathlib import Path

log = logging.getLogger("tcm.report")

PKG = Path(__file__).resolve().parents[2] / "report"

# Допущения ротации (в таблице их нет): простой 2 месяца, вклад в отделку 0 — как в gen_tenant_report.py.
VACANCY_MONTHS = 2
FITOUT_PER_M2 = 0

CAT_CODE = {"Fashion & Accessories": "FAS", "Food & Beverage": "FNB",
            "Home, Gifts & Lifestyle": "HGL", "Beauty & Health": "BTY",
            "Electronics & Mobile": "ELC", "Entertainment & Leisure": "ENT",
            "Services": "SVC", "Kiosk": "KSK", "Supermarket & Essentials": "SUP"}
SKIP = ("фильтр", "фидьтр", "тотал", "итого", "total")


class ReportError(RuntimeError):
    """Понятная человеку причина, почему PDF не собрать."""


# ---------------------------------------------------------------- разбор модели

def num(s):
    t = str(s if s is not None else "").strip().replace("\xa0", "").replace(" ", "").replace("%", "")
    if not t or t in {"-", "—"} or t.startswith("#"):
        return None
    t = t.replace(",", ".")
    if t.count(".") > 1:
        h, _, tl = t.rpartition(".")
        t = h.replace(".", "") + "." + tl
    try:
        return float(t)
    except ValueError:
        return None


def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().upper()


def js(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("</", "<\\/") + "'"
    if isinstance(v, float):
        return repr(round(v, 2))
    return repr(v)


def obj(d: dict) -> str:
    return "{" + ", ".join(f"{k}:{js(v)}" for k, v in d.items()) + "}"


def jlist(xs) -> str:
    return "[" + ", ".join("null" if x is None else repr(round(x, 2) if isinstance(x, float) else x) for x in xs) + "]"


class Sheet:
    def __init__(self, values):
        self.v = values or []

    def cell(self, r, c):
        row = self.v[r] if r < len(self.v) else []
        return str(row[c] if c is not None and c < len(row) else "").strip()

    def col(self, hdr_row, *names):
        hdr = self.v[hdr_row] if hdr_row < len(self.v) else []
        nz = lambda s: re.sub(r"[^a-zа-я0-9]", "", str(s or "").lower())
        for want in names:
            w = nz(want)
            for i, c in enumerate(hdr):
                if nz(c) == w or (nz(c) and nz(c).startswith(w)):
                    return i
        return None


def build_data(M: dict, sheets: dict) -> dict:
    """model.json + листы РЕЕСТР/Физибилити → строки JS для отчёта и соответствие бренд → id."""
    months = M["months"]
    reg = Sheet(sheets.get("РЕЕСТР", {}).get("values"))
    RH = 1
    c_brand, c_unit = reg.col(RH, "Бренд"), reg.col(RH, "Этаж")
    c_end, c_open = reg.col(RH, "Дата окончания аренды"), reg.col(RH, "Дата открытия по договору")
    c_dep, c_idx = reg.col(RH, "Сумма депозита"), reg.col(RH, "Ежегодная корректировка")
    if c_brand is None:
        raise ReportError("в выгрузке реестра нет колонки «Бренд»")
    reestr = {}
    for r in range(3, len(reg.v)):
        b = reg.cell(r, c_brand)
        if b and not b.lower().startswith(SKIP):
            reestr.setdefault(b.upper(), {"unit": reg.cell(r, c_unit), "end": reg.cell(r, c_end),
                                          "open": reg.cell(r, c_open), "dep": reg.cell(r, c_dep),
                                          "idx": reg.cell(r, c_idx)})

    fz = Sheet(sheets.get("Физибилити", {}).get("values"))
    f_brand = fz.col(1, "Brand")
    f_m2 = [fz.col(1, f"$/m² {n}Yr") for n in range(1, 6)]
    feas = {}
    if f_brand is not None:
        for r in range(2, len(fz.v)):
            b = fz.cell(r, f_brand)
            if b and not b.lower().startswith(SKIP):
                feas[b.upper()] = [num(fz.cell(r, c)) if c is not None else None for c in f_m2]

    is_storage = lambda b: bool(
        re.search(r"storage|склад", (b.get("category") or "") + (b.get("subcat") or ""), re.I)
        or re.search(r"склад|терраса|^atm|банкомат", b["brand"], re.I))
    area = lambda b: b.get("area_retail") or b.get("area_gross") or 0
    to = lambda b, m: (b["series"].get(m) or {}).get("to_usd")
    sv = lambda b, m, k: (b["series"].get(m) or {}).get(k)
    last = max((m for m in months if any(to(b, m) for b in M["brands"])), default=months[-1])
    win = [m for m in months if m <= last][-12:]
    pool = sorted((b for b in M["brands"] if not is_storage(b) and b.get("status") != "Неактуальный"
                   and area(b) > 0 and any(to(b, m) for m in win)), key=lambda x: x["brand"])

    used: set[str] = set()

    def slug(s):
        t = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
        t = re.sub(r"[^a-z0-9]+", "", t) or "t"
        if t[0].isdigit():
            t = "t" + t
        o, i = t, 2
        while o in used:
            o, i = f"{t}{i}", i + 1
        used.add(o)
        return o

    def floor_of(b):
        lv = b.get("level")
        if not lv:
            return "—"
        return "−1 этаж" if lv == "L-1" else f"{lv[1:]} этаж"

    def season_of(b):
        vals = {int(m[5:7]): to(b, m) for m in win if to(b, m)}
        if len(vals) < 6:
            return None
        avg = sum(vals.values()) / len(vals)
        return [round(vals[i] / avg * 100, 1) if i in vals else 100 for i in range(1, 13)]

    today = date.fromisoformat(last + "-01")
    plan_year = min((int(v["open"][-4:]) for v in reestr.values()
                     if re.match(r"^\d{2}\.\d{2}\.\d{4}$", v.get("open") or "")), default=2024)
    brands, deals, mall, taxonomy, plan_rows, fact_rows = [], [], [], [], [], []
    ids: dict[str, str] = {}

    for b in pool:
        key = b["brand"].upper()
        rid = slug(b["brand"])
        ids[norm(b["brand"])] = rid
        cat = b.get("category") or "Services"
        code = CAT_CODE.get(cat, "SVC")
        sub = b.get("subcat") or cat
        sub2 = b.get("subsub") or sub
        seg = b.get("segment") or "Mass"
        a = round(area(b), 1)
        rr = reestr.get(key, {})

        rows = []
        for m in months:
            if m > last:
                break
            s = b["series"].get(m) or {}
            v = s.get("to_usd")
            if v is None and s.get("missing", True):
                continue
            rows.append("{y:%s,m:%s,to:%s}" % (m[:4], int(m[5:7]), "null" if v is None else round(v)))
        n_hist = sum(1 for m in months if m <= last and to(b, m))
        brands.append(obj({"id": rid, "brand": b["brand"], "cat": cat, "catCode": code, "seg": seg,
                           "sub": sub, "sub2": sub2, "area": a, "floor": floor_of(b),
                           "unit": rr.get("unit") or "—", "n": n_hist})[:-1] + ", rows:[" + ",".join(rows) + "]}")

        # договор
        dep_i = b.get("dep") or {}
        cur_y = int(dep_i["cur_year"]) if dep_i.get("cur_year") else None
        lad = b.get("rate_ladder") or []
        rate = lad[cur_y - 1] if cur_y and 1 <= cur_y <= len(lad) else None
        rate = rate or next((x for x in reversed(lad) if x), None)
        if not rate and sv(b, last, "rent") and a:
            rate = sv(b, last, "rent") / a
        end = rr.get("end") or ""
        ends_in = None
        mm = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", end)
        if mm:
            ed = date(int(mm.group(3)), int(mm.group(2)), 1)
            ends_in = max(0, (ed.year - today.year) * 12 + ed.month - today.month)
        debt = b.get("debt") or {}
        bal, dz = debt.get("balance"), debt.get("days")
        d = {"id": rid, "contract": f"{rr.get('open') or '—'} — {end or '—'}",
             "type": "% с оборота" if sv(b, last, "rent_src") == "turnover" else "фикс $/м²",
             "rent": round(rate, 2) if rate else 0,
             "opex": round((sv(b, last, "opex") or 0) / a, 2) if a else 0,
             "mkt": round((sv(b, last, "mkt") or 0) / a, 2) if a else 0,
             "indexation": rr.get("idx") or "—",
             "deposit": f"{rr['dep']} мес. аренды" if rr.get("dep") else "—",
             "debt": round(-bal) if bal and bal < 0 else 0,
             "overdueDays": round(dz * 30) if dz and dz > 0 else 0,
             "zoneTraffic": round(b["traffic"]) if b.get("traffic") else None,
             "vacancyMonths": VACANCY_MONTHS, "fitOut": round(FITOUT_PER_M2 * a)}
        if ends_in is not None:
            d["endsIn"] = ends_in
        deals.append(f"  '{rid}': " + obj(d))

        # пул сравнения
        vals = [to(b, m) for m in win if to(b, m)]
        to_year = sum(vals) / len(vals) * 12 if vals else 0
        lm = int(last[:4]) * 12 + int(last[5:7])
        prev = [to(b, m) for m in months if m <= last and m < win[0]
                and int(m[:4]) * 12 + int(m[5:7]) >= lm - 23 and to(b, m)]
        growth = ((sum(vals) / len(vals)) / (sum(prev) / len(prev)) - 1) * 100 if prev and vals else 0
        occ_s, to_s = sum(sv(b, m, "occ") or 0 for m in win if to(b, m)), sum(vals)
        se = season_of(b)
        rec = {"id": rid, "brand": b["brand"], "cat": code, "catName": cat, "seg": seg, "sub": sub,
               "sub2": sub2, "area": a, "m2": round(to_year / 12 / a, 1) if a else 0,
               "occ": round(occ_s / to_s * 100, 1) if to_s else 0, "toYear": round(to_year),
               "growth": round(growth, 1), "rentM2": round(rate or 0, 2)}
        mall.append(obj(rec)[:-1] + ", season:" + (jlist(se) if se else "null") + "}")
        taxonomy.append(json.dumps(f"{seg}|{cat}|{sub}|{sub2}", ensure_ascii=False))

        f = feas.get(key)
        if f and any(x is not None for x in f):
            plan_rows.append(f"  '{rid}': " + jlist(f))
        if any(x is not None for x in lad):
            fact_rows.append(f"  '{rid}': " + jlist(lad))

    return {"brands": brands, "deals": deals, "mall": mall, "taxonomy": taxonomy, "plan": plan_rows,
            "fact": fact_rows, "plan_year": plan_year, "last": last, "ids": ids}


RATES_INJECT = """
/* ---- Данные Tashkent City Mall (сервер TCM Analytics, tenant_report.py) ----
   PLAN_BY_ID — лист «Физибилити», $/м² в месяц по годам договора 1..5;
   FACT_BY_ID — договорные ставки по годам (РЕЕСТР). Разрез по арендатору, поэтому
   planRate(), planLadder(), factLadder() переопределены (README, п.3.3). */
var PLAN_BY_ID = {
%s
};
var FACT_BY_ID = {
%s
};
function planRate(b, toYear){
  var p = PLAN_BY_ID[b.id];
  if (!p) return null;
  var base = null;
  for (var i = 0; i < p.length; i++) if (p[i] != null){ base = p[i]; break; }
  if (base == null) return null;
  return { base:base, rate:base, year:PLAN_YEAR, toYear:toYear || PLAN_YEAR };
}
function planLadder(b, d){
  var p = PLAN_BY_ID[b.id];
  if (!p) return null;
  var startY = contractStartYear(d), out = [], has = false;
  for (var i = 0; i < PLAN_TERM; i++){
    if (p[i] != null) has = true;
    out.push({ y:i + 1, cal:startY + i, plan:(p[i] == null ? null : p[i]) });
  }
  return has ? out : null;
}
function factLadder(d, curY){
  if (!d) return null;
  var f = FACT_BY_ID[d.id], out = [];
  for (var i = 1; i <= curY; i++){
    var v = (f && f[i - 1] != null) ? f[i - 1] : null;
    if (v == null && i === curY) v = d.rent;
    if (v != null) out.push({ y:i, fact:v });
  }
  return out.length ? out : null;
}
"""

DATA_TAIL = """function medianOf(list, key){
  var v = list.map(function(x){ return x[key]; }).filter(function(x){ return x != null; }).sort(function(a, b){ return a - b; });
  if (!v.length) return null;
  var h = Math.floor(v.length / 2);
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}
function mallMedian(cat, key){
  var v = MALL.filter(function(x){ return x.cat === cat; }).map(function(x){ return x[key]; }).sort(function(a, b){ return a - b; });
  if (!v.length) return null;
  var h = Math.floor(v.length / 2);
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}
"""


PRINT_ZOOM = 0.85
PRINT_CSS = """<style id="tcm-pdf">
:root{--tcmz:%s}
.sheet{width:calc(267mm / var(--tcmz))!important;height:calc(184mm / var(--tcmz))!important}
@media print{.sheet-wrap{zoom:var(--tcmz)}}
</style>
""" % PRINT_ZOOM


def build_html(data: dict, pkg: Path = PKG) -> str:
    """Шаблон report/tenant-report.html с подставленными данными (как build.py пакета)."""
    rd = lambda n: (pkg / n).read_text(encoding="utf-8").rstrip("\r\n") + "\n"
    cats = re.sub(r"var TAXONOMY = \[[^\]]*\];",
                  lambda _: "var TAXONOMY = [\n  " + ",\n  ".join(data["taxonomy"]) + "\n];", rd("categories.js"))
    rates = rd("rates-plan.js")
    rates = re.sub(r"var PLAN_YEAR = \d+;", f"var PLAN_YEAR = {data['plan_year']};", rates)
    rates = re.sub(r"var PLAN_INDEX = [\d.]+;", "var PLAN_INDEX = 0;", rates)  # план уже по годам договора
    rates += RATES_INJECT % (",\n".join(data["plan"]), ",\n".join(data["fact"]))
    dj = (f"/* Данные TCM из модели дашборда, последний месяц с оборотом: {data['last']}. */\n"
          "var BRANDS = [\n  " + ",\n  ".join(data["brands"]) + "\n];\n\n"
          "var DEAL = {\n" + ",\n".join(data["deals"]) + "\n};\n\n"
          "var MALL = [\n  " + ",\n  ".join(data["mall"]) + "\n];\n\n" + DATA_TAIL)
    block1 = "\n".join([cats, rd("ocr-benchmarks.js"), rd("to-benchmarks.js"), rates, dj])

    s = (pkg / "tenant-report.html").read_text(encoding="utf-8")
    blocks = list(re.finditer(r"<script>\r?\n(.*?)</script>", s, re.S))
    if len(blocks) != 5:
        raise ReportError(f"шаблон отчёта изменился: ожидалось 5 блоков script, найдено {len(blocks)}")
    m = blocks[1]
    s = s[:m.start(1)] + block1 + s[m.end(1):]
    # Арендатор — из адреса (#id), лист — A4 (а не «во всю ширину»). Демо-арендатора в данных нет.
    s = s.replace("STATE = { brand:'meridian', fs:1, wide:true }",
                  "STATE = { brand:(BRANDS.some(function(b){ return '#' + b.id === location.hash; }) ? "
                  "location.hash.slice(1) : BRANDS[0].id), fs:1, wide:false, grow:true }", 1)
    s = s.replace("(демо-данные)", "(Google-таблица «Реестр 26»)")
    # графики растягиваются под свободное место листа и в режиме A4 (в шаблоне — только «во всю ширину»)
    s = s.replace("} else if (STATE.wide){", "} else if (STATE.wide || STATE.grow){", 1)
    # На A4 шаблону тесно с реальными суммами: таблица «Итоги по годам» вылезает за карточку, графикам
    # не хватает высоты. Верстаем лист крупнее и при печати уменьшаем целиком (zoom) — раскладка та же.
    s = s.replace("</head>", PRINT_CSS + "</head>", 1)
    if "location.hash.slice(1)" not in s or "STATE.grow" not in s:
        raise ReportError("шаблон отчёта изменился: не найден выбор арендатора по умолчанию")
    return s


# ---------------------------------------------------------------- PDF

def find_chrome() -> str | None:
    env = os.environ.get("TCM_CHROME")
    if env:
        return env
    for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        p = shutil.which(c)
        if p:
            return p
    mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return mac if os.path.exists(mac) else None


def print_pdf(html: str, rid: str, chrome: str, timeout: int = 90) -> bytes:
    with tempfile.TemporaryDirectory(prefix="tcm-report-") as d:
        page, out = Path(d) / "report.html", Path(d) / "report.pdf"
        page.write_text(html, encoding="utf-8")
        cmd = [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
               "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
               "--hide-scrollbars", "--mute-audio", f"--user-data-dir={d}/profile",
               # отчёт внешних запросов не делает; страхуемся — сеть закрыта
               "--host-resolver-rules=MAP * ~NOTFOUND", "--no-pdf-header-footer",
               # окно больше листа (267×184 мм ≈ 1009×695 px): отчёт рисует графики 1:1, без уменьшения под экран
               "--window-size=1400,1100", "--virtual-time-budget=4000", "--run-all-compositor-stages-before-draw",
               f"--print-to-pdf={out}", page.as_uri() + "#" + rid]
        env = {**os.environ, "HOME": d, "XDG_CONFIG_HOME": d, "XDG_CACHE_HOME": d}
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=timeout, env=env)
        except subprocess.TimeoutExpired:
            raise ReportError("Chrome не успел напечатать отчёт") from None
        if not out.exists() or out.stat().st_size < 1000:
            log.error("Chrome: код %s, %s", r.returncode, r.stderr.decode(errors="replace")[-2000:])
            raise ReportError("Chrome не напечатал отчёт")
        return out.read_bytes()


class TenantReports:
    """Собирает HTML отчёта при обновлении model.json и печатает PDF по бренду (с кэшем)."""

    def __init__(self, data_dir: str | None = None, chrome: str | None = None):
        self.dir = Path(data_dir or os.environ.get("TCM_TR_DATA") or "")
        self.chrome = chrome or find_chrome()
        self.lock = threading.Lock()          # одна печать за раз: на ВМ два ядра
        self.version = None
        self.html = ""
        self.ids: dict[str, str] = {}
        self.last = ""
        self.pdfs: OrderedDict = OrderedDict()

    @property
    def enabled(self) -> bool:
        return bool(str(self.dir) not in ("", ".") and self.chrome)

    def _refresh(self):
        model = self.dir / "model.json"
        try:
            st = model.stat()
            ver = (st.st_mtime_ns, (self.dir / "raw_dump.json").stat().st_mtime_ns)
        except FileNotFoundError:
            raise ReportError("нет данных дашборда (model.json)") from None
        if ver == self.version:
            return
        M = json.loads(model.read_text(encoding="utf-8"))
        raw = json.loads((self.dir / "raw_dump.json").read_text(encoding="utf-8"))["sheets"]
        data = build_data(M, {k: raw[k] for k in ("РЕЕСТР", "Физибилити") if k in raw})
        del raw
        self.html, self.ids, self.last = build_html(data), data["ids"], data["last"]
        self.version, self.pdfs = ver, OrderedDict()
        log.info("отчёт по арендатору: %d брендов, данные по %s", len(self.ids), self.last)

    def resolve(self, name: str) -> str | None:
        n = norm(name)
        return self.ids.get(n) or self.ids.get(re.sub(r"\s+(NEW|OLD)$", "", n))

    def pdf(self, brand: str) -> tuple[bytes, str]:
        """→ (PDF, последний месяц данных). Бросает ReportError с понятным текстом."""
        if not self.enabled:
            raise ReportError("выгрузка не настроена на сервере")
        with self.lock:
            self._refresh()
            rid = self.resolve(brand)
            if not rid:
                raise ReportError(f"по бренду «{brand}» нет данных для отчёта (нет оборота за последние 12 месяцев "
                                  "или бренд не найден в модели)")
            key = (rid, self.version)
            if key in self.pdfs:
                self.pdfs.move_to_end(key)
                return self.pdfs[key], self.last
            pdf = print_pdf(self.html, rid, self.chrome)
            self.pdfs[key] = pdf
            while len(self.pdfs) > 40:
                self.pdfs.popitem(last=False)
            return pdf, self.last
