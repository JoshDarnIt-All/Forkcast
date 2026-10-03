import json
import os
import sqlite3
from fastapi import APIRouter, Depends, Header

from .. import ai
from ..db import get_db, VERSION, recipe_row
from ..errors import ApiError
from ..models import CATEGORIES, ProfileIn
from ..services.ingredients import SECTIONS

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"ok": True, "version": VERSION}


@router.get("/config")
def config():
    return {"ai_enabled": ai.enabled(), "sections": SECTIONS, "categories": CATEGORIES}


@router.get("/profiles")
def profiles(con: sqlite3.Connection = Depends(get_db)):
    return [dict(r) for r in con.execute("SELECT * FROM profiles ORDER BY id")]


@router.post("/profiles", status_code=201)
def add_profile(p: ProfileIn, con: sqlite3.Connection = Depends(get_db)):
    cur = con.execute("INSERT INTO profiles(name,color) VALUES(?,?)", (p.name.strip(), p.color))
    return {"id": cur.lastrowid, "name": p.name.strip(), "color": p.color}


@router.delete("/profiles/{pid}")
def del_profile(pid: int, con: sqlite3.Connection = Depends(get_db)):
    if not con.execute("DELETE FROM profiles WHERE id=?", (pid,)).rowcount:
        raise ApiError(404, "Profile not found", "not_found")
    return {"ok": True}


@router.get("/pantry")
def pantry(con: sqlite3.Connection = Depends(get_db)):
    return [r["name"] for r in con.execute("SELECT name FROM owned_names ORDER BY name")]


@router.delete("/pantry/{name}")
def pantry_del(name: str, con: sqlite3.Connection = Depends(get_db)):
    con.execute("DELETE FROM owned_names WHERE name=?", (name,))
    con.execute("UPDATE shopping_items SET owned=0 WHERE norm=?", (name,))
    return {"ok": True}


@router.get("/suggestions")
def suggestions(kind: str = "dinner", con: sqlite3.Connection = Depends(get_db)):
    if not ai.enabled():
        return {"enabled": False, "items": []}
    titles = [r["title"] for r in con.execute("SELECT title FROM recipes")]
    try:
        items = ai.get_provider().suggest(kind, titles)
    except Exception as e:
        raise ApiError(502, f"The AI provider failed: {e}", "ai_failed")
    from ..services.importer import finalize
    out = []
    for d in items:
        try:
            r = finalize({"title": d.get("title"), "ingredients": d.get("ingredients", []), "steps": d.get("steps", []),
                          "description": d.get("description"), "yields": d.get("servings"),
                          "prep": d.get("prep_min"), "cook": d.get("cook_min")})
            r["category"] = d.get("category") if d.get("category") in CATEGORIES else kind
            r.pop("_image_src", None)
            out.append(r)
        except ApiError:
            continue
    return {"enabled": True, "items": out}
