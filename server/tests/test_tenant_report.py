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
    assert "location.hash.slice(1)" in html and "STATE.grow" in html and 'id="tcm-pdf"' in html
    assert "(демо-данные)" not in html


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
