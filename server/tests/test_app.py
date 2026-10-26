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
    assert r.status_code == 303 and r.headers["location"] == "/login"
    assert c.get("/app.js").status_code == 401


def test_login_flow():
    c = client()
    r = c.post("/login", data={"login": "ceo", "password": "bad"}, follow_redirects=False)
    assert r.headers["location"] == "/login?e=1"
    r = c.post("/login", data={"login": "CEO", "password": "secret-1"}, follow_redirects=False)
    assert r.headers["location"] == "/"
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
    assert r.headers["location"] == "/login?e=2"
    # другие логины с того же адреса (например, все за одним туннелем) не блокируются
    r = c.post("/login", data={"login": "cfo", "password": "x"}, follow_redirects=False)
    assert r.headers["location"] == "/login?e=1"


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


def test_base_path(monkeypatch):
    monkeypatch.setenv("TCM_BASE_PATH", "/ceo/")
    c = client()
    r = c.get("/", follow_redirects=False)
    assert r.headers["location"] == "/ceo/login"
    assert '<base href="/ceo/">' in c.get("/login").text
    r = c.post("/login", data={"login": "ceo", "password": "secret-1"}, follow_redirects=False)
    assert r.headers["location"] == "/ceo/"
    assert "path=/ceo/" in r.headers["set-cookie"].lower().replace(" ", "")


def login(c, who="ceo"):
    r = c.post("/login", data={"login": who, "password": "secret-1"}, follow_redirects=False)
    assert r.headers["location"] == "/"


def test_comments(tmp_path):
    users = {"ceo": hash_password("secret-1"), "mgr": hash_password("secret-1")}
    app = create_app(loader=lambda: {"months": [], "brands": []}, users=users, secret=SECRET,
                     state_dir=str(tmp_path), managers={"mgr"})
    c = TestClient(app, base_url="https://testserver")
    assert c.get("/api/comments?obj=ZARA").status_code == 401
    login(c)
    assert c.get("/api/comments?obj=ZARA").json() == {"role": "management", "items": {}}
    assert c.post("/api/comments", data={"obj": "ZARA", "kind": "manager", "text": "x"}).status_code == 415
    assert c.post("/api/comments", json={"obj": "ZARA", "kind": "other", "text": "x"}).status_code == 400
    r = c.post("/api/comments", json={"obj": "ZARA", "kind": "management", "text": " Только для нас "})
    assert r.status_code == 200 and r.json()["item"]["t"] == "Только для нас" and r.json()["item"]["by"] == "ceo"
    c.post("/api/comments", json={"obj": "ZARA", "kind": "manager", "text": "План выполнен"})
    assert set(c.get("/api/comments?obj=ZARA").json()["items"]) == {"manager", "management"}

    m = TestClient(app, base_url="https://testserver")
    login(m, "mgr")
    j = m.get("/api/comments?obj=ZARA").json()
    assert j["role"] == "manager" and set(j["items"]) == {"manager", "management"}  # видит, но не пишет
    assert m.post("/api/comments", json={"obj": "ZARA", "kind": "management", "text": "x"}).status_code == 403
    # пустой текст удаляет комментарий
    assert m.post("/api/comments", json={"obj": "ZARA", "kind": "manager", "text": ""}).json() == {"item": None}
    assert list(c.get("/api/comments?obj=ZARA").json()["items"]) == ["management"]


def test_comments_disabled_without_state_dir(monkeypatch):
    monkeypatch.delenv("TCM_STATE_DIR", raising=False)
    c = client()
    login(c)
    assert c.get("/api/comments?obj=x").status_code == 503


def test_fonts_public():
    r = client().get("/fonts.css")
    assert r.status_code == 200 and "font-face" in r.text and "max-age" in r.headers["cache-control"]
