import sqlite3
from fastapi import APIRouter, Depends
from typing import Optional

from ..db import get_db
from ..errors import ApiError
from ..models import *
from ..services import shopping as shop
from ..services.ingredients import SECTIONS, normalize_name, classify_section

router = APIRouter(prefix="/api")


def draft_id(con):
    r = con.execute("SELECT id FROM plans WHERE status='draft' ORDER BY id LIMIT 1").fetchone()
    if r:
        return r["id"]
    return con.execute("INSERT INTO plans(name,status) VALUES('Next meal plan','draft')").lastrowid


def plan_dict(con, pid):
    p = con.execute("SELECT * FROM plans WHERE id=?", (pid,)).fetchone()
    if not p:
        raise ApiError(404, "Plan not found", "not_found")
    items = []
    for r in con.execute("""SELECT pi.*, r.title, r.image_url, r.category FROM plan_items pi JOIN recipes r ON r.id=pi.recipe_id
                            WHERE pi.plan_id=? ORDER BY COALESCE(pi.day,9), pi.id""", (pid,)):
        items.append({"id": r["id"], "recipe_id": r["recipe_id"],
                      "recipe": {"id": r["recipe_id"], "title": r["title"], "image_url": r["image_url"], "category": r["category"]},
                      "day": r["day"], "meal": r["meal"], "servings_multiplier": r["servings_multiplier"]})
    return {"id": p["id"], "name": p["name"], "status": p["status"], "created_at": p["created_at"], "items": items}


def _check_meal(m):
    if m is not None and m not in MEALS:
        raise ApiError(422, f"meal must be one of {MEALS}", "validation_error")


@router.get("/plans")
def plans(con: sqlite3.Connection = Depends(get_db)):
    out = []
    for p in con.execute("SELECT id FROM plans WHERE status='saved' ORDER BY id DESC").fetchall():
        d = plan_dict(con, p["id"])
        d["item_count"] = len(d["items"])
        out.append(d)
    return out


@router.get("/plans/current")
def current(con: sqlite3.Connection = Depends(get_db)):
    return plan_dict(con, draft_id(con))


@router.post("/plans/current/items", status_code=201)
def add_item(b: PlanItemIn, con: sqlite3.Connection = Depends(get_db)):
    _check_meal(b.meal)
    if not con.execute("SELECT 1 FROM recipes WHERE id=?", (b.recipe_id,)).fetchone():
        raise ApiError(404, "Recipe not found", "not_found")
    pid = draft_id(con)
    if not con.execute("SELECT 1 FROM plan_items WHERE plan_id=? AND recipe_id=? AND day IS ? AND meal IS ?",
                       (pid, b.recipe_id, b.day, b.meal)).fetchone():
        con.execute("INSERT INTO plan_items(plan_id,recipe_id,day,meal) VALUES(?,?,?,?)", (pid, b.recipe_id, b.day, b.meal))
    return plan_dict(con, pid)


@router.patch("/plans/items/{iid}")
def patch_item(iid: int, b: PlanItemPatch, con: sqlite3.Connection = Depends(get_db)):
    row = con.execute("SELECT * FROM plan_items WHERE id=?", (iid,)).fetchone()
    if not row:
        raise ApiError(404, "Plan item not found", "not_found")
    f = b.model_fields_set
    if "meal" in f:
        _check_meal(b.meal)
    day = b.day if "day" in f else row["day"]
    meal = b.meal if "meal" in f else row["meal"]
    mult = b.servings_multiplier if b.servings_multiplier is not None else row["servings_multiplier"]
    con.execute("UPDATE plan_items SET day=?, meal=?, servings_multiplier=? WHERE id=?", (day, meal, mult, iid))
    return plan_dict(con, row["plan_id"])


@router.delete("/plans/items/{iid}")
def del_item(iid: int, con: sqlite3.Connection = Depends(get_db)):
    row = con.execute("SELECT plan_id FROM plan_items WHERE id=?", (iid,)).fetchone()
    if not row:
        raise ApiError(404, "Plan item not found", "not_found")
    con.execute("DELETE FROM plan_items WHERE id=?", (iid,))
    return plan_dict(con, row["plan_id"])


@router.post("/plans/current/save")
def save(b: PlanSaveIn, con: sqlite3.Connection = Depends(get_db)):
    pid = draft_id(con)
    con.execute("UPDATE plans SET status='saved', name=?, created_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?",
                (b.name.strip() or "Meal plan", pid))
    shop.ensure_shopping(con, pid)
    con.execute("INSERT INTO plans(name,status) VALUES('Next meal plan','draft')")
    return plan_dict(con, pid)


@router.post("/plans/{pid}/reuse")
def reuse(pid: int, con: sqlite3.Connection = Depends(get_db)):
    src = plan_dict(con, pid)
    d = draft_id(con)
    con.execute("DELETE FROM plan_items WHERE plan_id=?", (d,))
    for it in src["items"]:
        con.execute("INSERT INTO plan_items(plan_id,recipe_id,day,meal,servings_multiplier) VALUES(?,?,?,?,?)",
                    (d, it["recipe_id"], it["day"], it["meal"], it["servings_multiplier"]))
    return plan_dict(con, d)


@router.get("/plans/{pid}")
def get_plan(pid: int, con: sqlite3.Connection = Depends(get_db)):
    return plan_dict(con, pid)


@router.patch("/plans/{pid}")
def rename(pid: int, b: PlanPatch, con: sqlite3.Connection = Depends(get_db)):
    plan_dict(con, pid)
    con.execute("UPDATE plans SET name=? WHERE id=?", (b.name, pid))
    return plan_dict(con, pid)


@router.delete("/plans/{pid}")
def del_plan(pid: int, con: sqlite3.Connection = Depends(get_db)):
    p = plan_dict(con, pid)
    if p["status"] == "draft":
        con.execute("DELETE FROM plan_items WHERE plan_id=?", (pid,))
    else:
        con.execute("DELETE FROM plans WHERE id=?", (pid,))
    return {"ok": True}


# ---------------------------------------------------------------- shopping
@router.get("/plans/{pid}/shopping")
def shopping(pid: int, con: sqlite3.Connection = Depends(get_db)):
    plan_dict(con, pid)
    return shop.shopping_view(con, pid)


def _item(con, iid):
    r = con.execute("SELECT * FROM shopping_items WHERE id=?", (iid,)).fetchone()
    if not r:
        raise ApiError(404, "Shopping item not found", "not_found")
    return r


@router.patch("/shopping/items/{iid}")
def patch_shop(iid: int, b: ShopPatch, con: sqlite3.Connection = Depends(get_db)):
    r = _item(con, iid)
    if b.checked is not None:
        con.execute("UPDATE shopping_items SET checked=? WHERE id=?", (int(b.checked), iid))
    if b.owned is not None:
        if b.owned:
            con.execute("INSERT OR IGNORE INTO owned_names(name) VALUES(?)", (r["norm"],))
        else:
            con.execute("DELETE FROM owned_names WHERE name=?", (r["norm"],))
        con.execute("UPDATE shopping_items SET owned=? WHERE norm=?", (int(b.owned), r["norm"]))
    if b.name:
        con.execute("UPDATE shopping_items SET name=?, norm=? WHERE id=?", (b.name.strip(), normalize_name(b.name), iid))
    if b.quantity is not None:
        con.execute("UPDATE shopping_items SET quantity=? WHERE id=?", (b.quantity, iid))
    from ..services.shopping import item_dict
    return item_dict(_item(con, iid))


@router.post("/plans/{pid}/shopping/items", status_code=201)
def add_custom(pid: int, b: ShopCustomIn, con: sqlite3.Connection = Depends(get_db)):
    plan_dict(con, pid)
    shop.ensure_shopping(con, pid)
    sec = b.section if b.section in SECTIONS else classify_section(b.name, b.unit)
    cur = con.execute("""INSERT INTO shopping_items(plan_id,name,norm,quantity,unit,section,custom) VALUES(?,?,?,?,?,?,1)""",
                      (pid, b.name.strip(), normalize_name(b.name), b.quantity, b.unit, sec))
    return shop.item_dict(_item(con, cur.lastrowid))


@router.delete("/shopping/items/{iid}")
def del_shop(iid: int, con: sqlite3.Connection = Depends(get_db)):
    r = _item(con, iid)
    if not r["custom"]:
        raise ApiError(400, "Only items you added yourself can be deleted. Tick 'already have it' instead.", "not_custom")
    con.execute("DELETE FROM shopping_items WHERE id=?", (iid,))
    return {"ok": True}


@router.post("/plans/{pid}/shopping/clear-checked")
def clear_checked(pid: int, con: sqlite3.Connection = Depends(get_db)):
    plan_dict(con, pid)
    shop.ensure_shopping(con, pid)
    con.execute("DELETE FROM shopping_items WHERE plan_id=? AND checked=1 AND custom=1", (pid,))
    con.execute("UPDATE shopping_items SET checked=0 WHERE plan_id=? AND checked=1", (pid,))
    return shop.shopping_view(con, pid)
