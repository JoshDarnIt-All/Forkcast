from app.services.shopping import merge_lines


def L(name, q, u, rid=1):
    return {"name": name, "quantity": q, "unit": u, "section": None, "recipe_id": rid}


def test_merge_volume_units():
    out = merge_lines([L("flour", 1.5, "cup"), L("Flour", 8, "tbsp", 2)])
    assert len(out) == 1 and out[0]["unit"] == "cup" and abs(out[0]["quantity"] - 2.0) < 0.01
    assert out[0]["recipe_ids"] == [1, 2]


def test_merge_weight_and_plurals():
    out = merge_lines([L("tomatoes", 2, None), L("tomato", 3, None, 2)])
    assert out[0]["quantity"] == 5 and len(out) == 1
    w = merge_lines([L("chicken breast", 8, "oz"), L("chicken breasts", 1, "lb", 2)])
    assert w[0]["unit"] == "lb" and w[0]["quantity"] == 1.5


def test_incompatible_units_stay_separate():
    out = merge_lines([L("garlic", 3, "clove"), L("garlic", 1, "tbsp", 2)])
    assert len(out) == 2


def test_qtyless_folds_in():
    out = merge_lines([L("salt", None, None), L("salt", 1, "tsp", 2)])
    assert len(out) == 1 and out[0]["quantity"] == 1 and sorted(out[0]["recipe_ids"]) == [1, 2]


def test_metric_stays_metric():
    out = merge_lines([L("sugar", 200, "g"), L("sugar", 0.5, "kg", 2)])
    assert out[0]["unit"] == "g" and out[0]["quantity"] == 700
