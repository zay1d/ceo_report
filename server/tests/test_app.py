from fastapi.testclient import TestClient

from tcm.app import create_app
from tcm.auth import check_password, hash_password, load_users

SECRET = "x" * 40


def client(loader=lambda: {"months": ["2026-09"], "brands": []}):
    users = {"ceo": hash_password("secret-1")}
    return TestClient(create_app(loader=loader, users=users, secret=SECRET), base_url="https://testserver")


def test_password_hash():
    h = hash_password("p@ss")
    assert h.startswith("scrypt.") and "$" not in h and check_password("p@ss", h) and not check_password("nope", h)
    assert load_users(f"Ceo:{h}, cfo:{h}") == {"ceo": h, "cfo": h}


def test_requires_login():
    c = client()
    assert c.get("/api/data").status_code == 401
    r = c.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "login"
    assert c.get("/app.js").status_code == 401


def test_login_flow():
    c = client()
    r = c.post("/login", data={"login": "ceo", "password": "bad"}, follow_redirects=False)
    assert r.headers["location"] == "login?e=1"
    r = c.post("/login", data={"login": "CEO", "password": "secret-1"}, follow_redirects=False)
    assert r.headers["location"] == "./"
    d = c.get("/api/data")
    assert d.status_code == 200 and d.json()["months"] == ["2026-09"] and d.json()["stale"] is False
    assert c.get("/").status_code == 200
    c.get("/logout")
    assert c.get("/api/data").status_code == 401


def test_throttle():
    c = client()
    for _ in range(5):
        c.post("/login", data={"login": "ceo", "password": "bad"})
    r = c.post("/login", data={"login": "ceo", "password": "secret-1"}, follow_redirects=False)
    assert r.headers["location"] == "login?e=2"
    # другие логины с того же адреса (например, все за одним туннелем) не блокируются
    r = c.post("/login", data={"login": "cfo", "password": "x"}, follow_redirects=False)
    assert r.headers["location"] == "login?e=1"


def test_stale_data_when_sheet_fails(monkeypatch):
    monkeypatch.setenv("TCM_CACHE_MIN", "0")  # перечитывать на каждый запрос
    calls = {"n": 0}

    def loader():
        calls["n"] += 1
        if calls["n"] > 1:
            raise RuntimeError("sheet down")
        return {"months": ["2026-09"], "brands": []}

    c = client(loader)
    c.post("/login", data={"login": "ceo", "password": "secret-1"})
    assert c.get("/api/data").json()["stale"] is False
    r = c.get("/api/data")
    assert r.status_code == 200 and r.json()["stale"] is True and r.json()["months"] == ["2026-09"]


def test_no_data_at_all():
    def loader():
        raise RuntimeError("sheet down")

    c = client(loader)
    c.post("/login", data={"login": "ceo", "password": "secret-1"})
    assert c.get("/api/data").status_code == 503
