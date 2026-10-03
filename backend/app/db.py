import json
import os
import sqlite3
from pathlib import Path

VERSION = "0.1.0"
PALETTE = ["#d1603d", "#3d7a6b", "#6b5ca5", "#c49a2c", "#2f6f9f", "#a0467a"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recipes(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, source_url TEXT, image_url TEXT, description TEXT DEFAULT '',
  servings INTEGER, prep_min INTEGER, cook_min INTEGER, total_min INTEGER,
  category TEXT DEFAULT 'other', tags TEXT DEFAULT '[]', favorite INTEGER DEFAULT 0, notes TEXT DEFAULT '',
  added_by INTEGER, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ingredients TEXT DEFAULT '[]', steps TEXT DEFAULT '[]');
CREATE INDEX IF NOT EXISTS idx_recipes_url ON recipes(source_url);
CREATE TABLE IF NOT EXISTS plans(
  id INTEGER PRIMARY KEY, name TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), shopping_sig TEXT);
CREATE TABLE IF NOT EXISTS plan_items(
  id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  day INTEGER, meal TEXT, servings_multiplier REAL DEFAULT 1);
CREATE TABLE IF NOT EXISTS shopping_items(
  id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL, norm TEXT NOT NULL, quantity REAL, unit TEXT, section TEXT DEFAULT 'Other',
  checked INTEGER DEFAULT 0, owned INTEGER DEFAULT 0, recipe_ids TEXT DEFAULT '[]', custom INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS owned_names(name TEXT PRIMARY KEY);
"""


def data_dir() -> Path:
    p = Path(os.environ.get("FORKCAST_DATA", "./data")).resolve()
    (p / "images").mkdir(parents=True, exist_ok=True)
    return p


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(data_dir() / "forkcast.db", check_same_thread=False, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    con = connect()
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    if con.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] == 0:
        con.executemany("INSERT INTO profiles(name,color) VALUES(?,?)", [("Josh", PALETTE[0]), ("Wife", PALETTE[1])])
    if con.execute("SELECT COUNT(*) FROM plans WHERE status='draft'").fetchone()[0] == 0:
        con.execute("INSERT INTO plans(name,status) VALUES('Next meal plan','draft')")
    con.commit()
    con.close()


def get_db():
    con = connect()
    try:
        yield con
        con.commit()
    finally:
        con.close()


def recipe_row(r: sqlite3.Row, full=True) -> dict:
    d = dict(r)
    d["tags"] = json.loads(d["tags"] or "[]")
    d["favorite"] = bool(d["favorite"])
    d["ingredients"] = json.loads(d["ingredients"] or "[]")
    d["steps"] = json.loads(d["steps"] or "[]")
    return d
