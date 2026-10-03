import json
import os
import sqlite3
from fastapi import APIRouter, Depends, Header, Response
from typing import Optional

from .. import ai
from ..db import get_db, recipe_row
from ..errors import ApiError
from ..models import RecipeIn, ImportIn, ShareIn, CATEGORIES
from ..services import importer
from ..services.ingredients import classify_section, parse_ingredient

router = APIRouter(prefix="/api")


def _prep_ings(items):
    out = []
    for i in items:
        d = i.model_dump() if hasattr(i, "model_dump") else dict(i)
        if not d.get("name") and d.get("raw"):
            d.update({k: v for k, v in parse_ingredient(d["raw"]).items() if k != "raw"})
        d["raw"] = d.get("raw") or " ".join(str(x) for x in (d.get("quantity"), d.get("unit"), d.get("name")) if x)
        if not d.get("section") or d["section"] == "Other":
            d["section"] = classify_section(d["name"], d.get("unit"))
        out.append(d)
    return out


def _insert(con, d: dict, added_by):
    cat = d.get("category") if d.get("category") in CATEGORIES else "other"
    cur = con.execute("""INSERT INTO recipes(title,source_url,image_url,description,servings,prep_min,cook_min,total_min,category,tags,
        favorite,notes,added_by,ingredients,steps) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (d["title"], d.get("source_url"), d.get("image_url"), d.get("description") or "", d.get("servings"), d.get("prep_min"),
         d.get("cook_min"), d.get("total_min"), cat, json.dumps(d.get("tags") or []), int(bool(d.get("favorite"))),
         d.get("notes") or "", added_by, json.dumps(_prep_ings(d.get("ingredients") or [])), json.dumps(d.get("steps") or [])))
    return get_recipe(con, cur.lastrowid)


def get_recipe(con, rid):
    r = con.execute("SELECT * FROM recipes WHERE id=?", (rid,)).fetchone()
    if not r:
        raise ApiError(404, "Recipe not found", "not_found")
    return recipe_row(r)


def _profile(x):
    try:
        return int(x) if x else None
    except ValueError:
        return None


@router.get("/recipes")
def list_recipes(q: str = "", category: str = "", tag: str = "", favorite: Optional[bool] = None, sort: str = "recent",
                 con: sqlite3.Connection = Depends(get_db)):
    sql, args = "SELECT * FROM recipes WHERE 1=1", []
    if q:
        sql += " AND (title LIKE ? OR tags LIKE ? OR ingredients LIKE ? OR description LIKE ?)"
        args += [f"%{q}%"] * 4
    if category:
        sql += " AND category=?"; args.append(category)
    if tag:
        sql += " AND tags LIKE ?"; args.append(f'%"{tag}"%')
    if favorite:
        sql += " AND favorite=1"
    sql += " ORDER BY title COLLATE NOCASE" if sort == "title" else " ORDER BY id DESC"
    return [recipe_row(r) for r in con.execute(sql, args)]


@router.get("/recipes/{rid}")
def one(rid: int, con: sqlite3.Connection = Depends(get_db)):
    return get_recipe(con, rid)


@router.post("/recipes", status_code=201)
def create(r: RecipeIn, x_profile_id: Optional[str] = Header(None), con: sqlite3.Connection = Depends(get_db)):
    return _insert(con, r.model_dump(), _profile(x_profile_id))


@router.put("/recipes/{rid}")
def update(rid: int, r: RecipeIn, con: sqlite3.Connection = Depends(get_db)):
    get_recipe(con, rid)
    d = r.model_dump()
    con.execute("""UPDATE recipes SET title=?,source_url=?,image_url=?,description=?,servings=?,prep_min=?,cook_min=?,total_min=?,
        category=?,tags=?,favorite=?,notes=?,ingredients=?,steps=? WHERE id=?""",
        (d["title"], d["source_url"], d["image_url"], d["description"], d["servings"], d["prep_min"], d["cook_min"], d["total_min"],
         d["category"] if d["category"] in CATEGORIES else "other", json.dumps(d["tags"]), int(d["favorite"]), d["notes"],
         json.dumps(_prep_ings(d["ingredients"])), json.dumps(d["steps"]), rid))
    return get_recipe(con, rid)


@router.delete("/recipes/{rid}")
def delete(rid: int, con: sqlite3.Connection = Depends(get_db)):
    if not con.execute("DELETE FROM recipes WHERE id=?", (rid,)).rowcount:
        raise ApiError(404, "Recipe not found", "not_found")
    return {"ok": True}


def do_import(con, url, text, profile, html=None):
    """Returns (recipe, created)."""
    if url:
        url = importer.clean_url(url)
        ex = con.execute("SELECT id FROM recipes WHERE source_url=?", (url,)).fetchone()
        if ex:
            return get_recipe(con, ex["id"]), False
        d = importer.scrape_url(url, html)
    elif text and text.strip():
        d = None
        if ai.enabled():
            try:
                a = ai.get_provider().extract_recipe(text)
                d = importer.finalize({"title": a.get("title"), "ingredients": a.get("ingredients", []), "steps": a.get("steps", []),
                                       "description": a.get("description"), "yields": a.get("servings"),
                                       "prep": a.get("prep_min"), "cook": a.get("cook_min")})
                if a.get("category") in CATEGORIES:
                    d["category"] = a["category"]
            except Exception:
                d = None
        if d is None:
            d = importer.parse_text(text)
    else:
        raise ApiError(400, "Provide a url or some recipe text.", "bad_request")
    src = d.pop("_image_src", None)
    d["image_url"] = importer.download_image(src, url) if src else None
    return _insert(con, d, profile), True


@router.post("/recipes/import", status_code=201)
def import_recipe(body: ImportIn, response: Response, x_profile_id: Optional[str] = Header(None),
                  con: sqlite3.Connection = Depends(get_db)):
    rec, created = do_import(con, body.url, body.text, _profile(x_profile_id), body.html)
    if not created:
        response.status_code = 200
    return rec


@router.post("/share")
def share(body: ShareIn, x_share_token: Optional[str] = Header(None), con: sqlite3.Connection = Depends(get_db)):
    token = os.environ.get("FORKCAST_SHARE_TOKEN", "")
    if not token or x_share_token != token:
        raise ApiError(401, "Bad or missing share token.", "unauthorized")
    rec, _ = do_import(con, body.url, None, None, body.html)
    return {"ok": True, "recipe_id": rec["id"], "title": rec["title"]}
