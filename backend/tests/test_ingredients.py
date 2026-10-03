import pytest
from app.services.ingredients import parse_ingredient, normalize_name, classify_section, parse_number


@pytest.mark.parametrize("raw,q,u,n", [
    ("1 1/2 cups all-purpose flour, sifted", 1.5, "cup", "all-purpose flour"),
    ("½ tsp salt", 0.5, "tsp", "salt"),
    ("1½ cups milk", 1.5, "cup", "milk"),
    ("2-3 tablespoons olive oil", 3.0, "tbsp", "olive oil"),
    ("1 (14 oz) can diced tomatoes", 1.0, "can", "tomatoes"),
    ("3 cloves garlic, minced", 3.0, "clove", "garlic"),
    ("2 large eggs", 2.0, None, "eggs"),
    ("1 T sugar", 1.0, "tbsp", "sugar"),
    ("200g spaghetti", 200.0, "g", "spaghetti"),
    ("Salt and pepper to taste", None, None, "salt and pepper"),
])
def test_parse(raw, q, u, n):
    p = parse_ingredient(raw)
    assert (p["quantity"], p["unit"], p["name"]) == (q, u, n)


def test_number():
    assert parse_number("1 1/2 cups")[0] == 1.5


def test_normalize_plural():
    assert normalize_name("Tomatoes") == normalize_name("tomato") == "tomato"
    assert normalize_name("red onions") == "red onion"
    assert normalize_name("Chopped Fresh Cilantro") == "cilantro"
    assert normalize_name("hummus") == "hummus"


@pytest.mark.parametrize("name,unit,sec", [
    ("chicken breast", None, "Meat & Seafood"), ("whole milk", "cup", "Dairy & Eggs"), ("baby spinach", None, "Produce"),
    ("flour tortilla", None, "Bakery"), ("frozen peas", None, "Frozen"), ("olive oil", "tbsp", "Pantry"),
    ("diced tomatoes", "can", "Canned & Jarred"), ("cumin", "tsp", "Spices & Baking"), ("red bell pepper", None, "Produce"),
    ("black pepper", "tsp", "Spices & Baking"), ("sparkling water", None, "Beverages"), ("unsalted butter", None, "Dairy & Eggs"),
    ("zzz-unknown", None, "Other"),
])
def test_sections(name, unit, sec):
    assert classify_section(name, unit) == sec
