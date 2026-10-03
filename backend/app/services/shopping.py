"""Shopping list engine: unit-aware merge + persistence."""
import json
from .ingredients import (VOLUME_TSP, WEIGHT_G, family, normalize_name, classify_section, SECTIONS)

METRIC_VOL = {"ml", "l"}
METRIC_WT = {"g", "kg"}


def _fmt_volume(tsp, metric):
    if metric:
        ml = tsp / VOLUME_TSP["ml"]
        return (round(ml / 1000, 2), "l") if ml >= 1000 else (round(ml), "ml")
    if tsp >= 12:  # >= 1/4 cup
        return round(tsp / 48, 2), "cup"
    if tsp >= 3:
        return round(tsp / 3, 2), "tbsp"
    return round(tsp, 2), "tsp"


def _fmt_weight(g, metric):
    if metric:
        return (round(g / 1000, 2), "kg") if g >= 1000 else (round(g), "g")
    oz = g / WEIGHT_G["oz"]
    return (round(oz / 16, 2), "lb") if oz >= 16 else (round(oz, 2), "oz")


def merge_lines(lines):
    """lines: [{name, quantity, unit, section, recipe_id}] (already scaled).
    Returns merged list [{name, norm, quantity, unit, section, recipe_ids}]."""
    groups = {}   # key -> dict
    order = []
    for ln in lines:
        norm = normalize_name(ln["name"])
        if not norm:
            continue
        unit, qty = ln.get("unit"), ln.get("quantity")
        fam = family(unit)
        key = (norm, fam or unit)
        g = groups.get(key)
        if g is None:
            g = groups[key] = {"norm": norm, "name": norm, "fam": fam, "unit": unit, "tot": 0.0, "has_qty": False,
                               "metric": False, "section": ln.get("section") or classify_section(norm, unit), "recipe_ids": []}
            order.append(key)
        if qty is not None:
            g["has_qty"] = True
            if fam == "vol":
                g["tot"] += qty * VOLUME_TSP[unit]
                g["metric"] |= unit in METRIC_VOL
            elif fam == "wt":
                g["tot"] += qty * WEIGHT_G[unit]
                g["metric"] |= unit in METRIC_WT
            else:
                g["tot"] += qty
        rid = ln.get("recipe_id")
        if rid is not None and rid not in g["recipe_ids"]:
            g["recipe_ids"].append(rid)
    # quantity-less lines ("salt to taste") fold into a sibling group of the same name if one exists
    out = []
    by_name = {}
    for key in order:
        by_name.setdefault(key[0], []).append(groups[key])
    for norm, gs in by_name.items():
        withq = [g for g in gs if g["has_qty"]]
        noq = [g for g in gs if not g["has_qty"]]
        if withq and noq:
            for g in noq:
                for r in g["recipe_ids"]:
                    if r not in withq[0]["recipe_ids"]:
                        withq[0]["recipe_ids"].append(r)
            gs = withq
        for g in gs:
            if not g["has_qty"]:
                q, u = None, g["unit"]
            elif g["fam"] == "vol":
                q, u = _fmt_volume(g["tot"], g["metric"])
            elif g["fam"] == "wt":
                q, u = _fmt_weight(g["tot"], g["metric"])
            else:
                q, u = round(g["tot"], 2), g["unit"]
            out.append({"name": g["name"], "norm": g["norm"], "quantity": q, "unit": u,
                        "section": g["section"], "recipe_ids": g["recipe_ids"]})
    return out


def plan_signature(con, plan_id):
    rows = con.execute("""SELECT pi.id, pi.recipe_id, pi.servings_multiplier, length(r.ingredients) l
        FROM plan_items pi JOIN recipes r ON r.id=pi.recipe_id WHERE pi.plan_id=? ORDER BY pi.id""", (plan_id,)).fetchall()
    return json.dumps([tuple(r) for r in rows])


def ensure_shopping(con, plan_id):
    """(Re)generate generated items when the plan changed, preserving checked state and custom items."""
    sig = plan_signature(con, plan_id)
    cur = con.execute("SELECT shopping_sig FROM plans WHERE id=?", (plan_id,)).fetchone()["shopping_sig"]
    if cur == sig:
        return
    # one merged line per distinct recipe_id+multiplier
    lines = []
    for it in con.execute("""SELECT pi.recipe_id, pi.servings_multiplier m, r.ingredients FROM plan_items pi
                             JOIN recipes r ON r.id=pi.recipe_id WHERE pi.plan_id=?""", (plan_id,)):
        for ing in json.loads(it["ingredients"] or "[]"):
            q = ing.get("quantity")
            lines.append({"name": ing.get("name") or "", "quantity": q * it["m"] if q is not None else None,
                          "unit": ing.get("unit"), "section": ing.get("section"), "recipe_id": it["recipe_id"]})
    merged = merge_lines(lines)
    old = {(r["norm"], r["unit"]): r["checked"] for r in
           con.execute("SELECT norm, unit, checked FROM shopping_items WHERE plan_id=? AND custom=0", (plan_id,))}
    owned = {r["name"] for r in con.execute("SELECT name FROM owned_names")}
    con.execute("DELETE FROM shopping_items WHERE plan_id=? AND custom=0", (plan_id,))
    for m in merged:
        con.execute("""INSERT INTO shopping_items(plan_id,name,norm,quantity,unit,section,checked,owned,recipe_ids,custom)
                       VALUES(?,?,?,?,?,?,?,?,?,0)""",
                    (plan_id, m["name"], m["norm"], m["quantity"], m["unit"], m["section"],
                     old.get((m["norm"], m["unit"]), 0), 1 if m["norm"] in owned else 0, json.dumps(m["recipe_ids"])))
    con.execute("UPDATE plans SET shopping_sig=? WHERE id=?", (sig, plan_id))


def item_dict(r):
    return {"id": r["id"], "plan_id": r["plan_id"], "name": r["name"], "quantity": r["quantity"], "unit": r["unit"],
            "section": r["section"], "checked": bool(r["checked"]), "owned": bool(r["owned"]),
            "recipe_ids": json.loads(r["recipe_ids"] or "[]"), "custom": bool(r["custom"])}


def shopping_view(con, plan_id):
    ensure_shopping(con, plan_id)
    rows = con.execute("SELECT * FROM shopping_items WHERE plan_id=? ORDER BY owned, name", (plan_id,)).fetchall()
    secs = []
    for s in SECTIONS:
        items = [item_dict(r) for r in rows if (r["section"] if r["section"] in SECTIONS else "Other") == s]
        if items:
            secs.append({"section": s, "items": items})
    return {"plan_id": plan_id, "sections": secs}
