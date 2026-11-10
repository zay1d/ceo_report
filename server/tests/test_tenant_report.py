"""PDF «Отчёт по арендатору»: сборка данных из модели дашборда (синтетика) и выдача PDF сервером."""
import json

from fastapi.testclient import TestClient

from tcm import tenant_report as tr
from tcm.app import create_app
from tcm.auth import hash_password

MONTHS = [f"2025-{m:02d}" for m in range(1, 13)] + [f"2026-{m:02d}" for m in range(1, 10)]


def brand(name, to, status="Актуальный", cat="Fashion & Accessories"):
    return {"brand": name, "category": cat, "subcat": "Apparel", "subsub": "Womenswear", "segment": "Mass",
            "status": status, "level": "L2", "area_retail": 100.0, "traffic": 48000.0,
            "rate_ladder": [40.0, 44.0, None, None, None], "dep": {"cur_year": 2.0},
            "debt": {"balance": -1500.0, "days": 1.0},
            "series": {m: {"to_usd": to * (1 + i / 50), "rent": 4000, "opex": 500, "mkt": 100, "occ": to * 0.1,
                           "rent_src": "fixed", "missing": False} for i, m in enumerate(MONTHS)}}


def model():
    return {"months": MONTHS, "brands": [brand("ZARA", 100000), brand("O'STIN", 30000), brand("SKLAD 1", 1000, cat="Storage"),
                                         brand("OLD", 5000, status="Неактуальный")]}


SHEETS = {
    "РЕЕСТР": {"values": [[], ["Бренд", "Этаж", "Дата открытия по договору", "Дата окончания аренды",
                                "Сумма депозита", "Ежегодная корректировка"], [], [],
                           ["ZARA", "2.10", "01.03.2025", "28.02.2030", "2", "01.03.2026"]]},
    "Физибилити": {"values": [[], ["Brand", "$/m² 1Yr", "$/m² 2Yr", "$/m² 3Yr", "$/m² 4Yr", "$/m² 5Yr"],
                              ["ZARA", "38", "40", "42", "44", "46"]]},
}


def test_build_data_and_html():
    d = tr.build_data(model(), SHEETS)
    assert set(d["ids"]) == {"ZARA", "O'STIN"}  # склад и неактуальный — не в отчёте
    assert d["last"] == "2026-09" and d["plan_year"] == 2025
    deal = next(x for x in d["deals"] if x.strip().startswith("'zara'"))
    assert "contract:'01.03.2025 — 28.02.2030'" in deal and "rent:44.0" in deal and "debt:1500" in deal
    assert "opex:5.0" in deal and "endsIn:41" in deal
    assert any("'zara': [38.0, 40.0, 42.0, 44.0, 46.0]" in x for x in d["plan"])
    html = tr.build_html(d)
    assert "O\\'STIN" in html and "CAFE MERIDIAN" not in html  # демо-данных не осталось
    assert "location.hash.slice(1)" in html and "STATE.grow" in html
    # лист 3: демо-генератор compare.js заменён нашими данными
    assert "lcg(5000" not in html and "var CMP_ALL = [" in html and "Демо: помесячный" not in html
    assert "В бою — из выгрузки" not in html
    assert "(демо-данные)" not in html


def test_trim_opening_month():
    rows = [("2024-02", 30), ("2024-03", 1276), ("2024-04", 1280), ("2024-05", 1130), ("2024-06", 1056)]
    assert tr.trim_opening(rows)[0][0] == "2024-03"          # открытие 29.02: день торговли — не месяц
    assert tr.trim_opening([("a", 0), ("b", None)] + rows[1:])[0][0] == "2024-03"
    assert tr.trim_opening(rows[1:]) == rows[1:]             # обычная история не трогается
    assert tr.trim_opening([("a", 900)] + rows[1:])[0][0] == "a"  # слабый, но полный месяц остаётся


def test_zero_rate_ladder_is_no_rate():
    m = model()
    m["brands"][0]["rate_ladder"] = [0.0, 0.0, 0.0, 0.0, 0.0]   # аренда процентом от оборота
    d = tr.build_data(m, SHEETS)
    assert not any(x.strip().startswith("'zara'") for x in d["fact"])  # не рисуем «факт $0»


def test_reports_refresh_and_resolve(tmp_path, monkeypatch):
    (tmp_path / "model.json").write_text(json.dumps(model()), encoding="utf-8")
    (tmp_path / "raw_dump.json").write_text(json.dumps({"sheets": SHEETS}), encoding="utf-8")
    calls = []
    monkeypatch.setattr(tr, "print_pdf", lambda html, rid, chrome: calls.append(rid) or b"%PDF-1.4 " + rid.encode())
    r = tr.TenantReports(str(tmp_path), chrome="/bin/true")
    assert r.pdf("zara") == (b"%PDF-1.4 zara", "2026-09")
    assert r.pdf("ZARA NEW")[0] == b"%PDF-1.4 zara" and calls == ["zara"]  # второй раз — из кэша
    try:
        r.pdf("NOBODY")
        raise AssertionError
    except tr.ReportError as e:
        assert "NOBODY" in str(e)


class FakeReports:
    def pdf(self, brand):
        if brand == "BAD":
            raise tr.ReportError("по бренду «BAD» нет данных")
        return b"%PDF-1.4 fake", "2026-09"


def test_endpoint():
    app = create_app(loader=lambda: {"months": [], "brands": []}, users={"ceo": hash_password("p")},
                     secret="x" * 40, reports=FakeReports())
    c = TestClient(app, base_url="https://testserver")
    assert c.get("/api/report.pdf?brand=ZARA").status_code == 401
    c.post("/login", data={"login": "ceo", "password": "p"})
    r = c.get("/api/report.pdf?brand=O'STIN")
    assert r.status_code == 200 and r.content == b"%PDF-1.4 fake" and r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"] and "filename*=UTF-8''" in r.headers["content-disposition"]
    assert c.get("/api/report.pdf?brand=BAD").json()["error"].startswith("по бренду")
    assert c.get("/api/report.pdf").status_code == 400


def test_zero_plan_years_are_no_plan():
    sheets = {**SHEETS, "Физибилити": {"values": [[], ["Brand", "$/m² 1Yr", "$/m² 2Yr", "$/m² 3Yr", "$/m² 4Yr", "$/m² 5Yr"],
                                                 ["ZARA", "38", "40", "42", "0", "0"]]}}
    d = tr.build_data(model(), sheets)
    # договор на 3 года: 4–5-й год в «Физибилити» нулями — плана нет, а не «$0» на графике
    assert any("'zara': [38.0, 40.0, 42.0, null, null]" in x for x in d["plan"])
    assert "Math.max(lastI + 1, cur)" in tr.build_html(d)   # лесенка обрезается по последнему году с планом


def page_model():
    """Наша модель страницы (/api/data) в минимальном виде: чеки, превышение, менеджер."""
    ms = MONTHS
    return {"asOf": "2026-10-15T12:00+05:00", "months": ms, "brands": [
        {"name": "ZARA", "mgr": "Diyor", "to": [100000.0] * len(ms), "ch": [2000] * len(ms), "ex": [5000.0] * len(ms)},
        {"name": "O'STIN", "mgr": "Buba", "to": [30000.0] * len(ms), "ch": [None] * len(ms), "ex": [0] * len(ms)}]}


def test_sheet3_data():
    d = tr.build_data(model(), SHEETS, page_model())
    assert d["cmp_mgrs"] == ["Buba", "Diyor"]
    zara = next(x for x in d["cmp"] if x.startswith("{id:'zara'"))
    assert "mgr:'Diyor'" in zara and "[2026,9,140000,50.0,5000]" in zara   # чек = 100000 / 2000
    ostin = next(x for x in d["cmp"] if "O\\'STIN" in x)
    assert ",null,0]" in ostin                                              # чеков нет — чек null, не 0
    html = tr.build_html(d)
    assert 'var CMP_MGRS = ["Buba", "Diyor"];' in html and "var CMP_LAST = { y:2026, m:9 };" in html
    # без нашей модели лист 3 всё равно собирается (чеки пустые)
    d2 = tr.build_data(model(), SHEETS)
    assert d2["cmp_mgrs"] == [] and all(",null,null]" in x for x in d2["cmp"])
