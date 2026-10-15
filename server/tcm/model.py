"""Превращает вкладки таблицы «Реестр 26» в набор данных для страницы.

Вход — сырые значения вкладок (списки строк, как их отдаёт Sheets API
с valueRenderOption=UNFORMATTED_VALUE и dateTimeRenderOption=FORMATTED_STRING).
Выход — словарь, который сервер отдаёт как /api/data. Все деньги — в долларах
по курсу ЦБ на конец месяца (вкладка «Курс»), без НДС.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

# Какие строки реестра попадают на страницу: действующие договоры (включая якорных
# «Партнеров» — Inditex, Galmart, Cinematica…), без складов.
STATUSES = {"Актуальный", "Партнеры", "На стадии открытия", "Новый"}
SKIP_CATEGORIES = {"Storage", "-", ""}

TAB_REGISTRY = "РЕЕСТР"
TAB_TURNOVER = "Тurnover"  # первая буква — кириллическая «Т», как в таблице
TAB_FX = "Курс"
TAB_TRAFFIC = "Заполняемость Mall"

MONTHS_RU = {"янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "мая": 5, "июн": 6,
             "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12}


def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s if s is not None else "")).strip().upper()


def num(v) -> float | None:
    """Число из ячейки: 12.5, «1 379,24», «140,40.» → float; пусто/ошибка → None."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[\s ]", "", str(v or "")).rstrip(".")
    if not s:
        return None
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def ddmmyyyy(v) -> str | None:
    """«29.02.2024» → «2024-02-29»; иначе None."""
    m = re.match(r"^\s*(\d{1,2})[./](\d{1,2})[./](\d{4})\s*$", str(v or ""))
    if not m:
        return None
    d, mo, y = map(int, m.groups())
    if not (2000 <= y <= 2100 and 1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return f"{y:04d}-{mo:02d}-{d:02d}"


def month_key(v) -> str | None:
    """Заголовок месяца → «YYYY-MM». Понимает «01.02.2024», «01/03/2024», «февр..24»."""
    s = str(v or "").strip().lower()
    m = re.match(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})$", s)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}"
    m = re.match(r"^([а-я]+)\.*\s*(\d{2})$", s)
    if m and m.group(1)[:3] in MONTHS_RU:
        return f"20{m.group(2)}-{MONTHS_RU[m.group(1)[:3]]:02d}"
    return None


def month_range(first: str, last: str) -> list[str]:
    y, m = map(int, first.split("-"))
    ly, lm = map(int, last.split("-"))
    out = []
    while (y, m) <= (ly, lm):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def cell(row, i):
    return row[i] if i < len(row) else ""


# ---------------------------------------------------------------- зоны и этажи

ZONE_RE = re.compile(r"(L-?\d)\s*,?\s*(main\s*atrium|atrium|food\s*cort?e?|future|heritage|c\s*\d)", re.I)
PPL_RE = re.compile(r"\(?\s*([\d\s ]{4,})\s*ppl", re.I)


def parse_zone(text) -> tuple[str | None, float | None]:
    """«L3 Main atrium (262 367 ppl)» → («L3 Main atrium», 262367)."""
    s = str(text or "")
    z = ZONE_RE.search(s)
    name = None
    if z:
        lvl = z.group(1).upper().replace("-", "")
        part = z.group(2).lower().replace(" ", "")
        part = {"mainatrium": "Main atrium", "atrium": "Main atrium", "future": "Future",
                "heritage": "Heritage"}.get(part, "Foodcourt" if part.startswith("food") else part.upper())
        name = f"{lvl} {part}"
    p = PPL_RE.search(s)
    return name, (num(p.group(1)) if p else None)


def parse_floor(zone_text, unit) -> str | None:
    s = str(zone_text or "")
    m = re.search(r"\bL-(\d)", s)
    if m:
        return f"B{m.group(1)}"
    m = re.search(r"\bL(\d)", s)
    if m:
        return f"L{m.group(1)}"
    u = str(unit or "").strip().upper()
    m = re.match(r"^B-?(\d)", u)
    if m:
        return f"B{m.group(1)}"
    m = re.match(r"^[KT](\d)", u)
    if m:
        return f"L{m.group(1)}"
    if u.startswith("F"):
        return "L3"  # фудкорт
    m = re.match(r"^(\d)[.,]", u)
    if m:
        return f"L{m.group(1)}"
    return None


# ---------------------------------------------------------------- вкладки

def parse_fx(rows) -> dict[str, float]:
    """Вкладка «Курс»: дата | курс | курс на конец месяца."""
    out = {}
    for r in rows:
        mk = month_key(cell(r, 0))
        rate = num(cell(r, 2)) or num(cell(r, 1))
        if mk and rate and rate > 1000:
            out[mk] = rate
    return out


def parse_traffic(rows) -> dict[str, float]:
    """Вкладка «Заполняемость Mall»: Месяц | Кол-во (посещаемость ТРЦ)."""
    out = {}
    for r in rows:
        for i in range(len(r) - 1):
            mk = month_key(r[i])
            v = num(cell(r, i + 1))
            if mk and v:
                out[mk] = v
                break
    return out


def find_header(rows, *names, limit=10) -> int:
    want = [norm(n) for n in names]
    for i, r in enumerate(rows[:limit]):
        cells = [norm(c) for c in r]
        if all(any(c.startswith(w) for c in cells) for w in want):
            return i
    raise ValueError(f"не найдена строка заголовков с колонками {names}")


def col(header, name, required=True) -> int | None:
    n = norm(name)
    for i, c in enumerate(header):
        if norm(c) == n:
            return i
    for i, c in enumerate(header):
        if norm(c).startswith(n):
            return i
    if required:
        raise ValueError(f"нет колонки «{name}»")
    return None


def parse_turnover(rows) -> tuple[dict[str, dict[str, tuple[float | None, float | None]]], list[str]]:
    """Вкладка «Тurnover»: по бренду пары колонок (ТО в сумах, чеки) на каждый месяц."""
    hi = find_header(rows, "Brand Name", "Legal name")
    h = rows[hi]
    ib = col(h, "Brand Name")
    months = []
    for j, c in enumerate(h):
        mk = month_key(c)
        if mk and (not months or months[-1][1] != mk):
            months.append((j, mk))
    data = {}
    for r in rows[hi + 1:]:
        key = norm(cell(r, ib))
        if not key or key.startswith("ФИЛЬТР"):
            continue
        series = {mk: (num(cell(r, j)), num(cell(r, j + 1))) for j, mk in months}
        if key in data:  # повтор бренда — складываем
            old = data[key]
            series = {mk: tuple((a or 0) + (b or 0) if (a is not None or b is not None) else None
                                for a, b in zip(old.get(mk, (None, None)), v)) for mk, v in series.items()}
        data[key] = series
    return data, [mk for _, mk in months]


BRAND_ROWS = {
    "rent": "АРЕНДА БЕЗ НДС",
    "over": "ПРЕВЫШЕНИЕ ТО",
    "opex": "OPEX+MARKETING",
}


def parse_brand_tab(rows) -> dict[str, dict[str, float]] | None:
    """Вкладка бренда: начисления молла по месяцам (сум, без НДС).

    Ищем строку «Период» (в колонке I) с месяцами, затем строки «Аренда без НДС»,
    «Превышение ТО», «OPEX+Marketing» до «К оплате итого». Возвращает
    {месяц: {rent, over, opex}} или None, если вкладка не похожа на карточку бренда.
    """
    hdr = None
    for i, r in enumerate(rows[:12]):
        if any(norm(c) == "ПЕРИОД" for c in r):
            hdr = i
            break
    if hdr is None:
        return None
    h = rows[hdr]
    lab = next(j for j, c in enumerate(h) if norm(c) == "ПЕРИОД")
    months = [(j, month_key(c)) for j, c in enumerate(h) if j > lab and month_key(c)]
    if not months:
        return None
    out: dict[str, dict[str, float]] = defaultdict(lambda: {"rent": 0.0, "over": 0.0, "opex": 0.0})
    seen = set()
    for r in rows[hdr + 1:]:
        label = norm(cell(r, lab))
        if label.startswith("К ОПЛАТЕ"):
            break
        for k, prefix in BRAND_ROWS.items():
            if label.startswith(prefix) and (k == "opex" or k not in seen):
                seen.add(k)
                for j, mk in months:
                    v = num(cell(r, j))
                    if v:
                        out[mk][k] += v
    return dict(out)


# ---------------------------------------------------------------- реестр

@dataclass
class Brand:
    key: str
    name: str
    legal: str = ""
    cat: str = ""
    sub: str = ""
    ss: str = ""
    seg: str = ""
    floor: str | None = None
    zone: str | None = None
    zone_ppl: float | None = None
    mgr: str = ""
    area: float = 0.0
    open: str | None = None
    end: str | None = None
    rates: list[float] = field(default_factory=list)
    pcts: list[float] = field(default_factory=list)
    names: set[str] = field(default_factory=set)


def parse_registry(rows) -> list[Brand]:
    hi = find_header(rows, "Бренд", "Категория", "Статус")
    h = rows[hi]
    c = {k: col(h, n, required=req) for k, n, req in [
        ("tab", "Примечание", False), ("legal", "Название организации", False), ("brand", "Бренд", True),
        ("cat", "Категория", True), ("mgr", "Менеджер", False), ("unit", "Этаж", False),
        ("area", "Площадь по договору", True), ("terr", "Площадь Терраса", False),
        ("r1", "Ставка аренды на 1й год", False), ("r2", "Ставка аренды на 2й год", False),
        ("r3", "Ставка аренды на 3й год", False), ("r4", "Ставка аренды на 4й год", False),
        ("r5", "Ставка аренды на 5й год", False), ("openp", "Дата открытия по договору", False),
        ("p1", "ТО на 1й год", False), ("p2", "ТО на 2й год", False), ("p3", "ТО на 3й год", False),
        ("openf", "Дата открытия (ФАКТ)", False), ("end", "Дата окончания аренды", False),
        ("sub", "Подкатегория", False), ("seg", "СЕГМЕНТ", False), ("status", "Статус", True),
        ("zone", "Секция (TRAFFIC)", False), ("ss", "Под-подкатегория", False),
    ]}
    # «Площадь\n Терраса m2» нормализуется в «ПЛОЩАДЬ ТЕРРАСА M2», а «Площадь по договору» — отдельно.
    if c["terr"] is None:
        c["terr"] = next((i for i, x in enumerate(h) if "ТЕРРАСА" in norm(x)), None)
    g = lambda r, k: cell(r, c[k]) if c[k] is not None else ""

    brands: dict[str, Brand] = {}
    for r in rows[hi + 1:]:
        name = str(g(r, "brand") or "").strip()
        if not name or norm(g(r, "tab")).startswith("ФИЛЬТР"):
            continue
        if str(g(r, "status")).strip() not in STATUSES or str(g(r, "cat")).strip() in SKIP_CATEGORIES:
            continue
        base = str(g(r, "tab") or "").strip() or name
        key = norm(base)
        b = brands.get(key)
        terrace = "ТЕРРАС" in norm(name) or "TERRAS" in norm(name)
        if b is None:
            b = brands[key] = Brand(key=key, name=re.sub(r"\s+(NEW|OLD)$", "", base, flags=re.I))
        b.names.update({norm(name), key})
        b.area += (num(g(r, "area")) or 0) + (num(g(r, "terr")) or 0)
        if terrace and b.cat:
            continue  # строка террасы добавляет площадь, остальное берём из основной строки
        zname, zppl = parse_zone(g(r, "zone"))
        b.legal = str(g(r, "legal") or "").strip()
        b.cat = str(g(r, "cat") or "").strip()
        b.sub = str(g(r, "sub") or "").strip()
        b.ss = str(g(r, "ss") or "").strip()
        b.seg = str(g(r, "seg") or "").strip()
        b.mgr = str(g(r, "mgr") or "").strip()
        b.zone, b.zone_ppl = zname, zppl
        b.floor = parse_floor(g(r, "zone"), g(r, "unit"))
        b.open = ddmmyyyy(g(r, "openf")) or ddmmyyyy(g(r, "openp"))
        b.end = ddmmyyyy(g(r, "end"))
        b.rates = [num(g(r, k)) for k in ("r1", "r2", "r3", "r4", "r5")]
        b.pcts = [num(g(r, k)) for k in ("p1", "p2", "p3")]
    for b in brands.values():
        for f in ("mgr", "sub", "ss", "seg"):
            if getattr(b, f) in ("-", "0"):
                setattr(b, f, "")
    return list(brands.values())


def lookup(names: set[str], table: dict):
    """Ищем бренд в другой вкладке по названию; «X NEW» → «X» как запасной вариант."""
    for n in names:
        if n in table:
            return n
    for n in names:
        s = re.sub(r"\s+(NEW|OLD)$", "", n)
        if s in table:
            return s
    return None


# ---------------------------------------------------------------- сборка

def zone_bases(brands: list[Brand]) -> dict[str, float]:
    """Замер трафика зоны: самое частое число среди строк реестра этой зоны."""
    votes: dict[str, Counter] = defaultdict(Counter)
    for b in brands:
        if b.zone and b.zone_ppl:
            votes[b.zone][b.zone_ppl] += 1
    return {z: c.most_common(1)[0][0] for z, c in sorted(votes.items())}


def contract_year_value(values: list[float | None], opened: str | None, today: str) -> float | None:
    """Значение для текущего года договора (1-й, 2-й, …); пустые годы — берём последний заполненный."""
    if not any(values):
        return None
    k = 0
    if opened and today > opened:
        oy, om, od = map(int, opened.split("-"))
        ty, tm, td = map(int, today.split("-"))
        k = (ty - oy) - ((tm, td) < (om, od))
    k = max(0, min(k, len(values) - 1))
    while k > 0 and not values[k]:
        k -= 1
    return values[k] or None


def build(tabs: dict[str, list], brand_tabs: dict[str, list], today: str, as_of: str) -> dict:
    fx = parse_fx(tabs[TAB_FX])
    traffic = parse_traffic(tabs.get(TAB_TRAFFIC, []))
    to_raw, to_months = parse_turnover(tabs[TAB_TURNOVER])
    brands = parse_registry(tabs[TAB_REGISTRY])

    # Последний месяц с данными: хотя бы 80 % брендов от предыдущего месяца сдали ТО.
    counts = [sum(1 for s in to_raw.values() if (s.get(mk, (None,))[0] or 0) > 0) for mk in to_months]
    last = 0
    for i, n in enumerate(counts):
        if n and (i == 0 or n >= 0.8 * counts[i - 1]):
            last = i
    first = next((i for i, n in enumerate(counts) if n), 0)
    months = month_range(to_months[first], to_months[last])

    fx_by = []
    known = None
    for mk in months:
        known = fx.get(mk, known)
        fx_by.append(known)
    if any(r is None for r in fx_by):
        first_known = next(r for r in fx_by if r)
        fx_by = [r or first_known for r in fx_by]
    latest_fx = fx_by[-1]

    zbase = zone_bases(brands)
    tab_index = {norm(t): t for t in brand_tabs}
    out_brands = []
    unmatched_to, unmatched_tab = [], []
    for b in sorted(brands, key=lambda x: x.name.upper()):
        tk = lookup(b.names, to_raw)
        tab = lookup(b.names, tab_index)
        charges = parse_brand_tab(brand_tabs[tab_index[tab]]) if tab else None
        if tk is None:
            unmatched_to.append(b.name)
        if charges is None:
            unmatched_tab.append(b.name)
        to, ch, cost = [], [], []
        for mk, rate in zip(months, fx_by):
            t, c = to_raw.get(tk, {}).get(mk, (None, None)) if tk else (None, None)
            to.append(round(t / rate, 2) if t and t > 0 else None)
            ch.append(round(c) if c and c > 0 and t and t > 0 else None)
            if charges is None:
                cost.append(None)
            else:
                x = charges.get(mk)
                cost.append(round((x["rent"] + x["over"] + x["opex"]) / rate, 2) if x else 0)
        rate = contract_year_value(b.rates, b.open, today)
        pct = contract_year_value(b.pcts, b.open, today)
        if rate and rate > 1000:  # ставка в сумах (такое есть в реестре) → $
            rate = rate / latest_fx
        out_brands.append({
            "name": b.name, "legal": b.legal, "cat": b.cat, "sub": b.sub, "ss": b.ss, "seg": b.seg,
            "floor": b.floor, "zone": b.zone if b.zone in zbase else None, "mgr": b.mgr,
            "area": round(b.area, 2), "open": b.open, "end": b.end,
            "rate": round(rate, 2) if rate else None,
            "toPct": round(pct, 4) if pct and 0 < pct < 1 else None,
            "to": to, "ch": ch, "cost": cost,
        })

    return {
        "asOf": as_of,
        "months": months,
        "fx": fx_by,
        "mallTraffic": [traffic.get(mk) for mk in months],
        "zones": zbase,
        "brands": out_brands,
        "quality": {"noTurnover": unmatched_to, "noBrandTab": unmatched_tab},
    }
