"""Тесты разбора таблицы на синтетических данных той же формы, что «Реестр 26»."""
import pytest

from tcm import model


def registry():
    head = ["Примечание", " № договора", "Название организации", "Бренд", "Категория", "Менеджер", "Этаж",
            "Площадь по договору\n m2", "Площадь\n  Терраса m2", "Склад", "Ставка аренды на 1й год",
            "Дата открытия по договору", "Дата открытия (ФАКТ)", "Дата окончания аренды",
            "Ставка аренды на 2й год", "ТО на 1й год", "ТО на 2й год", "Подкатегория", "СЕГМЕНТ ", "Статус",
            "Секция (TRAFFIC)", "Под-подкатегория"]
    rows = [
        ["", "", "", "", "", "", "", 1000],
        head,
        ["фильтр"],
        ["ALPHA", 1, "ООО ALPHA", "ALPHA", "Fashion & Accessories", "Buba", "2.37", 100, "", "", 40,
         "01.03.2024", "01.03.2024", "28.02.2029", 50, 0.1, 0.11, "Apparel", "Mass", "Актуальный",
         "L2 C2 (48 094 ppl)", "Womenswear"],
        ["ALPHA", 2, "ООО ALPHA", "ALPHA Терраса", "Fashion & Accessories", "Buba", "T1-01", 20, "", "", 10,
         "", "", "", "", "", "", "", "", "Актуальный", "", ""],
        ["ALPHA склад", 3, "ООО ALPHA", "ALPHA склад", "Storage", "Buba", "B-2 S 15", 40, "", 40, 50,
         "", "", "", "", "", "", "Storage", "Storage", "Актуальный", 0, "Storage"],
        ["BETA NEW", 4, "ООО BETA", "BETA NEW", "Food & Beverage", "Diyor", "3,36a+3,36b", 200, "", "", "",
         "", "15.05.2024", "", "", 0.055, "", "Cafe", "Upper Mass", "Партнеры",
         "L3 Main atrium (262 367 ppl)", ""],
        ["GAMMA", 5, "ООО GAMMA", "GAMMA", "Services", "Diyor", "1.01", 50, "", "", 30,
         "", "", "", "", "", "", "", "", "Неактуальный", "", ""],
    ]
    return rows


def turnover():
    head = ["№", "Legal name", "Brand Name", "Дата откр. факт", "Area (m2)", " Resp Commercial", "% TO",
            "Подкатегория", "01.02.2024", "01.02.2024", "01.03.2024", "01.03.2024", "01.04.2024", "01.04.2024",
            "01.05.2024", "01.05.2024"]
    return [
        [""], [""], head, ["фильтр->"],
        [1, "ALPHA", "ALPHA", "", 100, "", 0.1, "", "", "", 1_250_000_000, 500, 1_300_000_000, 520, 0, ""],
        [2, "BETA", "BETA", "", 200, "", 0.05, "", "", "", "", "", 2_600_000_000, 1000, 2_700_000_000, 1100],
        [3, "GAMMA", "GAMMA", "", 50, "", 0, "", "", "", 500_000_000, 100, "", "", "", ""],
    ]


def fx():
    return [[], ["ФАКТ"], ["дата", "курс", "курс на конец месяца"],
            ["01.02.2024", 12400, 12500], ["01.03.2024", 12500, 12500], ["01.04.2024", 12600, 13000],
            ["01.05.2024", 12700, 13000]]


def brand_tab():
    return [
        ["Дата отчета", "15.10.2026"], [], [],
        ["", "", "", "", "", "", "", "", "Курс ЦБ на конец месяца", 12500, 12500, 13000],
        ["", "", "", "", "", "", "", "", "Период", "февр..24", "мар..24", "апр..24", "мая.24"],
        ["", "", "", "", "", "", "", "", "Аренда без НДС", 0, 50_000_000, 52_000_000, 52_000_000],
        ["", "", "", "", "", "", "", "", "ТО без НДС", 0, 1_250_000_000, 1_300_000_000, 0],
        ["", "", "", "", "", "", "", "", "Превышение ТО", 0, 75_000_000, 78_000_000, 0],
        ["", "", "", "", "", "", "", "", "OPEX+Marketing", 0, 0, 0, 0],
        ["", "", "", "", "", "", "", "", "OPEX+Marketing", 0, 0, 0, 0],
        ["", "", "", "", "", "", "", "", "Коммунальные платежи", 1, 2, 3, 4],
        ["", "", "", "", "", "", "", "", "К оплате итого", 9, 9, 9, 9],
        ["", "", "", "", "", "", "", "", "Превышение ТО в USD", 999, 999, 999, 999],
    ]


@pytest.fixture
def data():
    tabs = {model.TAB_REGISTRY: registry(), model.TAB_TURNOVER: turnover(), model.TAB_FX: fx(),
            model.TAB_TRAFFIC: [["", "Месяц", "Кол-во"], ["", "01/03/2024", 1_000_000], ["", "01/04/2024", 1_200_000]]}
    return model.build(tabs, {"ALPHA": brand_tab()}, today="2026-10-15", as_of="2026-10-15T12:00+05:00")


def test_selection_and_merge(data):
    names = [b["name"] for b in data["brands"]]
    # склад и неактуальный договор не попадают; «Партнеры» попадают; NEW убирается из названия
    assert names == ["ALPHA", "BETA"]
    alpha = data["brands"][0]
    assert alpha["area"] == 120  # зал + терраса
    assert alpha["floor"] == "L2" and alpha["zone"] == "L2 C2"
    assert alpha["legal"] == "ООО ALPHA" and alpha["sub"] == "Apparel" and alpha["ss"] == "Womenswear"


def test_months_and_usd(data):
    # май сдали меньше 80 % брендов (только BETA из двух) — последний полный месяц апрель
    assert data["months"] == ["2024-03", "2024-04"]
    assert data["fx"] == [12500, 13000]
    alpha = data["brands"][0]
    assert alpha["to"] == [100000.0, 100000.0]
    assert alpha["ch"] == [500, 520]
    # OCR-числитель: аренда + превышение ТО + OPEX (до «К оплате»), в долларах
    assert alpha["cost"] == [(50_000_000 + 75_000_000) / 12500, (52_000_000 + 78_000_000) / 13000]


def test_missing_data_is_null(data):
    beta = data["brands"][1]
    assert beta["to"][0] is None and beta["ch"][0] is None  # не было ТО в марте
    assert beta["cost"] == [None, None]  # нет вкладки бренда
    assert "BETA" in data["quality"]["noBrandTab"]


def test_rates_and_traffic(data):
    alpha, beta = data["brands"]
    assert alpha["rate"] == 50  # 3-й год договора → последняя заполненная ставка (2-й год)
    assert alpha["toPct"] == 0.11
    assert beta["rate"] is None and beta["toPct"] == 0.055
    assert data["zones"] == {"L2 C2": 48094, "L3 Main atrium": 262367}
    assert data["mallTraffic"] == [1_000_000, 1_200_000]


@pytest.mark.parametrize("raw,expected", [
    ("L3 Main atrium (262 367 ppl)", ("L3 Main atrium", 262367)),
    ("L2 Future 153 347 ppl", ("L2 Future", 153347)),
    ("L3 Foodcorte (103 079 ppl)", ("L3 Foodcourt", 103079)),
    ("L3 atrium, L3C1 (262 367 ppl)", ("L3 Main atrium", 262367)),
    ("L-1", (None, None)),
    (0, (None, None)),
])
def test_parse_zone(raw, expected):
    assert model.parse_zone(raw) == expected


@pytest.mark.parametrize("zone,unit,floor", [
    ("L-1", "B1.05", "B1"), ("", "B-2 S 15", "B2"), ("", "K1-03", "L1"), ("", "F12", "L3"),
    ("", "3,36a+3,36b", "L3"), ("L4", "", "L4"),
])
def test_parse_floor(zone, unit, floor):
    assert model.parse_floor(zone, unit) == floor


@pytest.mark.parametrize("raw,key", [
    ("01.02.2024", "2024-02"), ("01/03/2024", "2024-03"), ("февр..24", "2024-02"), ("мая.25", "2025-05"),
    ("сент..26", "2026-09"), ("Итого", None),
])
def test_month_key(raw, key):
    assert model.month_key(raw) == key


def test_num():
    assert model.num("1 379,24") == 1379.24
    assert model.num("140,40.") == 140.4
    assert model.num("#REF!") is None
    assert model.num(True) is None
