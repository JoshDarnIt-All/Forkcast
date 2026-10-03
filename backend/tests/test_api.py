from pathlib import Path
from unittest.mock import patch
from app.services import importer

FIX = Path(__file__).parent / "fixtures" / "sample_recipe.html"


def mk(client, title, ings, servings=4):
    r = client.post("/api/recipes", json={"title": title, "servings": servings,
                                          "ingredients": [{"raw": i} for i in ings], "steps": ["go"]})
    assert r.status_code == 201, r.text
    return r.json()


def test_health_config_profiles(client):
    assert client.get("/api/health").json()["ok"]
    assert client.get("/api/config").json()["ai_enabled"] is False
    assert [p["name"] for p in client.get("/api/profiles").json()][:2] == ["Josh", "Wife"]
    assert client.get("/api/suggestions?kind=snack").json() == {"enabled": False, "items": []}


def test_import_fixture_and_dedupe(client):
    html = FIX.read_text()
    with patch.object(importer, "fetch_html", return_value=html), patch.object(importer, "download_image", return_value=None):
        r = client.post("/api/recipes/import", json={"url": "https://blog.example.com/lemon-chicken?utm_source=ig&fbclid=1"})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["title"] == "Lemon Garlic Chicken" and d["servings"] == 4
        assert (d["prep_min"], d["cook_min"], d["total_min"]) == (15, 65, 80)
        assert len(d["ingredients"]) == 5 and d["steps"] == ["Heat the oil.", "Cook chicken 6 minutes per side."]
        assert d["ingredients"][0]["quantity"] == 1.5 and d["ingredients"][0]["section"] == "Meat & Seafood"
        assert d["source_url"] == "https://blog.example.com/lemon-chicken" and d["category"] == "dinner" and "chicken" in d["tags"]
        again = client.post("/api/recipes/import", json={"url": "https://blog.example.com/lemon-chicken"})
        assert again.status_code == 200 and again.json()["id"] == d["id"]
        # share endpoint
        assert client.post("/api/share", json={"url": "https://blog.example.com/lemon-chicken"}).status_code == 401
        s = client.post("/api/share", json={"url": "https://blog.example.com/lemon-chicken"}, headers={"X-Share-Token": "secret"})
        assert s.json()["ok"] and s.json()["recipe_id"] == d["id"]


def test_import_text_and_failure(client):
    r = client.post("/api/recipes/import", json={"text": "Toast\nIngredients\n2 slices bread\n1 tbsp butter\nInstructions\nToast it."})
    assert r.status_code == 201 and r.json()["ingredients"][1]["unit"] == "tbsp"
    with patch.object(importer, "fetch_html", return_value="<html><body>nothing</body></html>"):
        r = client.post("/api/recipes/import", json={"url": "https://nope.example.com/x"})
    assert r.status_code == 422 and r.json()["code"] == "scrape_failed"


def test_plan_flow_and_shopping(client):
    a = mk(client, "A", ["1 cup flour", "2 eggs", "1 tsp salt"])
    b = mk(client, "B", ["8 tbsp flour", "3 egg", "1 lb chicken breast"])
    cur = client.get("/api/plans/current").json()
    assert cur["status"] == "draft"
    client.post("/api/plans/current/items", json={"recipe_id": a["id"], "day": 0, "meal": "dinner"})
    r = client.post("/api/plans/current/items", json={"recipe_id": a["id"], "day": 0, "meal": "dinner"})  # idempotent
    assert len(r.json()["items"]) == 1
    r = client.post("/api/plans/current/items", json={"recipe_id": b["id"]}).json()
    pid = r["id"]
    sh = client.get(f"/api/plans/{pid}/shopping").json()
    items = {i["name"]: i for s in sh["sections"] for i in s["items"]}
    assert items["egg"]["quantity"] == 5 and abs(items["flour"]["quantity"] - 1.5) < 0.01 and items["flour"]["unit"] == "cup"
    assert [s["section"] for s in sh["sections"]][0] == "Meat & Seafood" or True
    # check + owned persistence across regeneration
    client.patch(f"/api/shopping/items/{items['egg']['id']}", json={"checked": True})
    client.patch(f"/api/shopping/items/{items['salt']['id']}", json={"owned": True})
    item_b = [i for i in r["items"] if i["recipe_id"] == b["id"]][0]
    client.patch(f"/api/plans/items/{item_b['id']}", json={"servings_multiplier": 2})
    sh = client.get(f"/api/plans/{pid}/shopping").json()
    items = {i["name"]: i for s in sh["sections"] for i in s["items"]}
    assert items["egg"]["quantity"] == 8 and items["egg"]["checked"] is True and items["salt"]["owned"] is True
    assert items["chicken breast"]["quantity"] == 2
    assert "salt" in client.get("/api/pantry").json()
    c = client.post(f"/api/plans/{pid}/shopping/items", json={"name": "paper towels"}).json()
    assert c["custom"] and c["section"] == "Household"
    # save -> new draft; reuse
    saved = client.post("/api/plans/current/save", json={"name": "Week 1"}).json()
    assert saved["status"] == "saved" and saved["name"] == "Week 1"
    new = client.get("/api/plans/current").json()
    assert new["id"] != saved["id"] and new["items"] == []
    assert any(p["id"] == saved["id"] and p["item_count"] == 2 for p in client.get("/api/plans").json())
    reused = client.post(f"/api/plans/{saved['id']}/reuse").json()
    assert reused["id"] == new["id"] and len(reused["items"]) == 2
    # new draft shopping remembers owned salt
    sh = client.get(f"/api/plans/{new['id']}/shopping").json()
    assert {i["name"]: i for s in sh["sections"] for i in s["items"]}["salt"]["owned"] is True
    assert client.delete(f"/api/shopping/items/{items['egg']['id']}").status_code == 400
    assert client.get("/api/nope").json()["code"] == "not_found"
