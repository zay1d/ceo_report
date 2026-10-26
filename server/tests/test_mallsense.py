"""MallSense на поддельных ответах API той же формы, что в документации."""
import datetime as dt

from tcm import mallsense as ms

ZONES = [
    {"id": 1, "name": "L1_Main atrium", "object_type": "zone", "is_active": True},
    {"id": 2, "name": "L3_Foodcorte", "object_type": "zone", "is_active": True},
    {"id": 3, "name": "L2_C2", "object_type": "zone", "is_active": False},
    {"id": 4, "name": "B1_Metro corridor", "object_type": "zone", "is_active": True},
    {"id": 27283, "name": "ТРЦ", "object_type": "place", "is_active": True},
]


class Resp:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self.data


class FakeHttp:
    """Отдаёт значения по формуле, чтобы проверять, что куда легло."""

    def __init__(self, fail=False):
        self.fail, self.posts = fail, []

    def get(self, url, headers, timeout):
        assert headers["x-token"] == "t" and headers["x-app-key"] == "k"
        return Resp(ZONES)

    def post(self, url, json, headers, timeout):
        if self.fail:
            raise ConnectionError("down")
        p = json["input_parameters"]
        assert p["alias"] is None and p["metric"] == ms.METRIC
        self.posts.append(p)
        a, b = (dt.date.fromisoformat(x) for x in p["time_range"])
        times = []
        if p["time_freq"] == "MS":
            d = a.replace(day=1)
            while d <= b:
                times.append(d.isoformat() + "T00:00:00")
                d = (d + dt.timedelta(days=32)).replace(day=1)
        elif p["time_freq"] == "D":
            d = a
            while d <= b:
                times.append(d.isoformat() + "T00:00:00")
                d += dt.timedelta(days=1)
        elif p["time_freq"] == "H":
            times = [f"{a.isoformat()}T{h:02d}:00:00" for h in range(10, 23)]
        res = []
        for oid in p["obj_ids"]:
            items = [{"time": t, "value": (None if p["time_freq"] == "H" and t[11:13] > "14" else
                                           oid * 10 + int(t[5:7]) + int(t[8:10]))} for t in times]
            res.append({"context": {"data_objects": [{"id": oid, "name": str(oid)}]}, "items": items})
        return Resp({"result": res, "error": None})


def client(**kw):
    return ms.MallSense("t", "k", session=FakeHttp(**kw))


def base():
    return {"months": ["2026-07", "2026-08", "2026-09"], "mallTraffic": [500.0, None, None],
            "zones": {"L1 Main atrium": 1000, "L3 Foodcourt": 2000}, "brands": []}


NOW = dt.datetime(2026, 10, 26, 15, 30, tzinfo=dt.timezone(dt.timedelta(hours=5)))


def test_zone_names_match_registry():
    assert ms.zone_name("L1_Main atrium") == "L1 Main atrium"
    assert ms.zone_name("L3_Foodcorte") == "L3 Foodcourt"
    assert ms.zone_name("L2_C3") == "L2 C3"
    assert ms.zone_name("B1_Metro corridor") == "B1 Metro corridor"


def test_enrich():
    c = client()
    d = ms.enrich(base(), c, NOW)
    assert d["trafficSource"] == "mallsense"
    # ТРЦ: id*10 + месяц + 1 (число)
    assert d["mallTraffic"] == [272830 + 7 + 1, 272830 + 8 + 1, 272830 + 9 + 1]
    # только зоны реестра, неактивная и Metro corridor не попадают
    assert d["zoneTraffic"] == {"L1 Main atrium": [18, 19, 20], "L3 Foodcourt": [28, 29, 30]}
    # веса зон — средний месячный вход
    assert d["zones"] == {"L1 Main atrium": 19, "L3 Foodcourt": 29} and d["zoneWeights"] == "mallsense"
    # помесячный запрос — по конец последнего месяца данных, все объекты одним запросом
    mp = next(p for p in c.http.posts if p["time_freq"] == "MS")
    assert mp["time_range"] == ["2026-07-01", "2026-09-30"] and mp["obj_ids"][0] == ms.MALL_OBJ
    v = d["live"]
    assert v["month"] == "2026-10" and v["mtdDays"] == 25 and v["yesterdayDate"] == "2026-10-25"
    assert v["yesterday"] == 272830 + 10 + 25
    assert v["mtd"] == sum(272830 + 10 + k for k in range(1, 26))
    assert v["mtdLy"] == v["mtd"]  # те же дни год назад — та же формула
    assert v["today"] == 5 * (272830 + 10 + 26) and v["todayTo"] == "15:00"


def test_first_day_of_month_uses_previous_month():
    d = ms.enrich(base(), client(), dt.datetime(2026, 11, 1, 9, 0))
    assert d["live"]["month"] == "2026-10" and d["live"]["mtdDays"] == 31


def test_partial_zones_keep_registry_weights():
    b = base()
    b["zones"]["L2 C9"] = 500  # зоны нет в MallSense
    d = ms.enrich(b, client(), NOW)
    assert d["zones"] == b["zones"] and "zoneWeights" not in d and "L2 C9" not in d["zoneTraffic"]


def test_enrich_safe_falls_back_to_sheet():
    b = base()
    d = ms.enrich_safe(b, client(fail=True), NOW)
    assert d["trafficSource"] == "sheet" and d["trafficError"] and d["mallTraffic"] == [500.0, None, None]
    assert "zoneTraffic" not in d and b == base()  # исходные данные не испорчены
    d = ms.enrich_safe(b, ms.MallSense("", "", session=FakeHttp()), NOW)
    assert d["trafficSource"] == "sheet" and "trafficError" not in d
