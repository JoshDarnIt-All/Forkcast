"""Ingredient parsing, name normalisation, unit handling, store-section classification."""
import re
from fractions import Fraction

SECTIONS = ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Frozen", "Pantry",
            "Canned & Jarred", "Spices & Baking", "Beverages", "Snacks", "Household", "Other"]

UNICODE_FRACS = {"½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅛": "1/8",
                 "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5", "⅙": "1/6"}

# canonical unit -> (aliases)
_UNIT_ALIASES = {
    "tsp": ["tsp", "tsps", "teaspoon", "teaspoons", "t"],
    "tbsp": ["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons", "tbl"],
    "cup": ["cup", "cups", "c"],
    "fl oz": ["fl oz", "fluid ounce", "fluid ounces"],
    "oz": ["oz", "ounce", "ounces"],
    "lb": ["lb", "lbs", "pound", "pounds"],
    "g": ["g", "gram", "grams", "gr"],
    "kg": ["kg", "kilogram", "kilograms", "kgs"],
    "ml": ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
    "l": ["l", "liter", "liters", "litre", "litres"],
    "pinch": ["pinch", "pinches"],
    "dash": ["dash", "dashes"],
    "clove": ["clove", "cloves"],
    "can": ["can", "cans", "tin", "tins"],
    "jar": ["jar", "jars"],
    "package": ["package", "packages", "pkg", "pkgs", "packet", "packets", "pack"],
    "bunch": ["bunch", "bunches"],
    "stick": ["stick", "sticks"],
    "slice": ["slice", "slices"],
    "sprig": ["sprig", "sprigs"],
    "head": ["head", "heads"],
    "stalk": ["stalk", "stalks"],
    "bag": ["bag", "bags"],
    "bottle": ["bottle", "bottles"],
    "quart": ["quart", "quarts", "qt"],
    "pint": ["pint", "pints", "pt"],
    "gallon": ["gallon", "gallons", "gal"],
}
UNIT_MAP = {a: u for u, al in _UNIT_ALIASES.items() for a in al}
# single-letter aliases are ambiguous; only accept if followed by "." or exact tsp/tbsp case
_AMBIG = {"t", "c"}

# Conversion within families -> base (tsp for volume, g for weight)
VOLUME_TSP = {"tsp": 1, "tbsp": 3, "fl oz": 6, "cup": 48, "ml": 0.2028841, "l": 202.8841,
              "pint": 96, "quart": 192, "gallon": 768}
WEIGHT_G = {"g": 1, "kg": 1000, "oz": 28.3495, "lb": 453.592}


def family(unit):
    if unit in VOLUME_TSP:
        return "vol"
    if unit in WEIGHT_G:
        return "wt"
    return None


def parse_number(s: str):
    """'1 1/2' -> 1.5, '½' -> .5, '1-2' -> 2 (upper bound), '1.5' -> 1.5. Returns (value, rest)."""
    s = s.strip()
    for k, v in UNICODE_FRACS.items():
        s = re.sub(rf"(\d)\s*{k}", rf"\1 {v}", s)
        s = s.replace(k, v)
    num = r"(\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?)"
    m = re.match(rf"^{num}(?:\s*(?:-|–|—|to)\s*{num})?\s*", s)
    if not m:
        return None, s

    def val(t):
        t = t.replace(",", ".") if re.fullmatch(r"\d+,\d+", t) else t
        if " " in t:
            a, b = t.split()
            return float(a) + float(Fraction(b))
        if "/" in t:
            return float(Fraction(t))
        return float(t)
    first = val(m.group(1))
    q = val(m.group(2)) if m.group(2) else first
    return q, s[m.end():]


_PREP = r"\b(finely|roughly|coarsely|thinly|freshly|fresh|large|medium|small|chopped|diced|minced|sliced|grated|shredded|crushed|melted|softened|peeled|cubed|divided|packed|room temperature|to taste|optional|rinsed|drained|beaten|ground|cooked|uncooked|boneless|skinless|plus more|for serving|for garnish|lightly|heaping|level)\b"


def parse_ingredient(raw: str) -> dict:
    raw = (raw or "").strip()
    text = re.sub(r"\s+", " ", raw)
    text = re.sub(r"^[\-\*•▢☐]\s*", "", text)
    qty, rest = parse_number(text)
    unit = None
    # parenthetical size like "(14 oz)" after quantity: "1 (14 oz) can tomatoes"
    m = re.match(r"^\(([^)]*)\)\s*", rest)
    paren = None
    if m:
        paren = m.group(1)
        rest = rest[m.end():]
    mu = re.match(r"^(fl\.?\s*oz\.?|[A-Za-z]+)\.?\s*(?=\S|$)", rest)
    if mu:
        w = mu.group(1).lower().replace(".", "")
        w = re.sub(r"\s+", " ", w)
        tok = mu.group(1)
        if tok == "T":
            unit, rest = "tbsp", rest[mu.end():]
        elif tok in ("t",):
            unit, rest = "tsp", rest[mu.end():]
        elif w in UNIT_MAP and w not in _AMBIG:
            unit, rest = UNIT_MAP[w], rest[mu.end():]
        elif w in ("c", "C") and qty is not None and tok in ("c", "C"):
            unit, rest = "cup", rest[mu.end():]
    if qty is None and unit is None:
        pass
    rest = re.sub(r"^of\s+", "", rest.strip())
    if paren and unit is None:
        # "1 (14 oz) can" handled above only if can matched; otherwise keep paren as noise
        pass
    name = clean_name(rest)
    if not name:
        name = clean_name(text)
    return {"raw": raw, "quantity": qty, "unit": unit, "name": name}


def clean_name(s: str) -> str:
    s = re.sub(r"\([^)]*\)", " ", s)
    s = s.split(",")[0]
    s = re.sub(r"\s+(or|for)\s+.*$", "", s) if re.search(r"\s(for)\s", s) else s
    s = re.sub(_PREP, " ", s, flags=re.I)
    s = re.sub(r"[^A-Za-z0-9' &\-éèñ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" -&")
    return s.lower()


_IRREG = {"tomatoes": "tomato", "potatoes": "potato", "leaves": "leaf", "loaves": "loaf",
          "berries": "berry", "cherries": "cherry", "anchovies": "anchovy", "radishes": "radish",
          "peaches": "peach", "dishes": "dish", "olives": "olive", "cloves": "clove",
          "chilies": "chili", "chiles": "chile", "mangoes": "mango", "avocados": "avocado",
          "eggs": "egg", "onions": "onion", "carrots": "carrot", "lemons": "lemon", "limes": "lime"}
_NO_SINGULAR = {"hummus", "couscous", "asparagus", "molasses", "swiss", "lemongrass", "watercress",
                "grits", "oats", "greens", "peas", "beans", "noodles", "fries", "chips", "brussels sprouts"}


def singularize_word(w: str) -> str:
    if w in _IRREG:
        return _IRREG[w]
    if w in _NO_SINGULAR or len(w) <= 3:
        return w
    if w.endswith("ss") or w.endswith("us") or w.endswith("is"):
        return w
    if w.endswith("ies"):
        return w[:-3] + "y"
    if w.endswith("oes"):
        return w[:-2]
    if w.endswith("ches") or w.endswith("shes") or w.endswith("xes"):
        return w[:-2]
    if w.endswith("s"):
        return w[:-1]
    return w


def normalize_name(name: str) -> str:
    name = clean_name(name)
    name = re.sub(r"^(the|a|an|some|of)\s+", "", name)
    words = name.split()
    if words:
        words[-1] = singularize_word(words[-1])
    return " ".join(words)


# ---------------------------------------------------------------- sections
_KW = {
    "Produce": """apple banana orange lemon lime grapefruit pear peach plum nectarine grape strawberry blueberry raspberry blackberry
cherry melon watermelon cantaloupe pineapple mango papaya kiwi pomegranate avocado tomato cucumber zucchini squash pumpkin eggplant
pepper jalapeno serrano poblano habanero onion shallot scallion leek garlic ginger potato sweet potato yam carrot celery radish beet
turnip parsnip rutabaga lettuce romaine arugula spinach kale chard cabbage broccoli cauliflower brussels sprout asparagus artichoke
green bean snap pea corn mushroom cilantro parsley basil mint dill rosemary thyme sage oregano chive tarragon lemongrass herb
bok choy fennel kohlrabi okra jicama cranberry fig date apricot clementine tangerine salad greens sprouts microgreens edamame
celeriac daikon watercress endive radicchio plantain tomatillo cress""",
    "Meat & Seafood": """chicken beef pork turkey lamb veal bacon sausage ham steak ground beef ground turkey ribs brisket roast
prosciutto pancetta chorizo salami pepperoni hot dog meatball duck bratwurst salmon tuna cod tilapia halibut trout shrimp prawn crab
lobster scallop mussel clam oyster squid calamari anchovy sardine fish fillet mahi swordfish haddock venison bison kielbasa
drumstick thigh breast wing tenderloin sirloin chuck flank""",
    "Dairy & Eggs": """milk butter cream half and half yogurt cheese cheddar mozzarella parmesan parmigiano feta ricotta cottage
gouda swiss provolone brie goat cheese cream cheese sour cream egg eggs buttermilk mascarpone gruyere pecorino halloumi paneer
whipping cream creme fraiche margarine ghee kefir cotija queso monterey jack colby""",
    "Bakery": """bread bun roll bagel baguette tortilla pita naan croissant english muffin ciabatta sourdough brioche flatbread
wrap breadcrumb crouton focaccia""",
    "Frozen": """frozen ice cream sorbet popsicle""",
    "Pantry": """oil olive oil vegetable oil canola sesame oil vinegar balsamic soy sauce tamari fish sauce worcestershire pasta spaghetti
penne linguine fettuccine macaroni orzo rice quinoa couscous barley farro oats oatmeal cereal noodle ramen lentil chickpea black bean
kidney bean pinto bean honey maple syrup molasses peanut butter almond butter jam jelly preserves mustard mayonnaise mayo ketchup
hot sauce sriracha salsa bbq sauce tahini miso nut walnut almond pecan cashew pistachio peanut pine nut seed sesame chia flax
raisin dried cranberry cocoa broth stock bouillon coconut milk panko tortilla chip cracker cornmeal polenta grits hoisin teriyaki
dressing agave ramen udon vermicelli lentils""",
    "Canned & Jarred": """canned can diced tomato tomato paste tomato sauce crushed tomato passata marinara pasta sauce pickle olive caper
artichoke heart roasted red pepper sauerkraut kimchi jarred coconut cream condensed milk evaporated milk refried bean chipotle in adobo
pumpkin puree applesauce beans""",
    "Spices & Baking": """salt pepper black pepper paprika cumin coriander turmeric cinnamon nutmeg clove cardamom cayenne chili powder
chili flake red pepper flake garlic powder onion powder oregano dried bay leaf allspice curry powder garam masala italian seasoning
taco seasoning cajun seasoning old bay vanilla extract baking soda baking powder yeast flour sugar brown sugar powdered sugar
confectioners cornstarch cornflour chocolate chip cocoa powder cream of tartar sprinkles food coloring saffron fennel seed mustard seed
za'atar sumac five spice seasoning msg gelatin shortening almond extract""",
    "Beverages": """water juice soda cola wine beer vodka rum whiskey bourbon tequila gin liqueur brandy coffee tea sparkling lemonade
kombucha cider champagne sherry vermouth seltzer""",
    "Snacks": """chips popcorn pretzel granola bar candy cookie trail mix jerky fruit snack cracker graham""",
    "Household": """paper towel foil aluminum plastic wrap parchment napkin sponge soap detergent trash bag toothpick skewer""",
}
# multiword phrases checked first, then single words by last-word priority
_PHRASE_OVERRIDES = [
    ("snap pea", "Produce"), ("pepper jack", "Dairy & Eggs"), ("tortilla", "Bakery"), ("egg noodle", "Pantry"),
    ("noodle", "Pantry"), ("peanut", "Pantry"), ("ice cream", "Frozen"), ("frozen", "Frozen"), ("coconut milk", "Canned & Jarred"), ("coconut cream", "Canned & Jarred"),
    ("tomato paste", "Canned & Jarred"), ("tomato sauce", "Canned & Jarred"), ("diced tomato", "Canned & Jarred"),
    ("crushed tomato", "Canned & Jarred"), ("canned", "Canned & Jarred"), ("evaporated milk", "Canned & Jarred"),
    ("condensed milk", "Canned & Jarred"), ("peanut butter", "Pantry"), ("almond butter", "Pantry"),
    ("cream cheese", "Dairy & Eggs"), ("sour cream", "Dairy & Eggs"), ("cream of tartar", "Spices & Baking"),
    ("baking powder", "Spices & Baking"), ("baking soda", "Spices & Baking"), ("black pepper", "Spices & Baking"),
    ("bell pepper", "Produce"), ("red pepper flake", "Spices & Baking"), ("chili flake", "Spices & Baking"),
    ("chili powder", "Spices & Baking"), ("garlic powder", "Spices & Baking"), ("onion powder", "Spices & Baking"),
    ("garlic clove", "Produce"), ("green onion", "Produce"), ("green bean", "Produce"), ("sweet potato", "Produce"),
    ("hot dog bun", "Bakery"), ("hamburger bun", "Bakery"), ("bread crumb", "Pantry"), ("breadcrumb", "Pantry"),
    ("panko", "Pantry"), ("english muffin", "Bakery"), ("coffee", "Beverages"), ("chicken broth", "Pantry"),
    ("chicken stock", "Pantry"), ("beef broth", "Pantry"), ("vegetable broth", "Pantry"), ("stock", "Pantry"),
    ("broth", "Pantry"), ("coconut oil", "Pantry"), ("oil", "Pantry"), ("vinegar", "Pantry"), ("sauce", "Pantry"),
    ("ground beef", "Meat & Seafood"), ("ground turkey", "Meat & Seafood"), ("ground pork", "Meat & Seafood"),
    ("ground cumin", "Spices & Baking"), ("ground cinnamon", "Spices & Baking"), ("ground ginger", "Spices & Baking"),
    ("ground coriander", "Spices & Baking"), ("ground nutmeg", "Spices & Baking"), ("dried", "Spices & Baking"),
    ("chicken", "Meat & Seafood"), ("garlic", "Produce"), ("orange juice", "Beverages"), ("lemon juice", "Produce"),
    ("lime juice", "Produce"), ("vanilla", "Spices & Baking"), ("brown sugar", "Spices & Baking"), ("sugar", "Spices & Baking"),
    ("flour", "Spices & Baking"), ("salt", "Spices & Baking"), ("pepper", "Spices & Baking"),
    ("jalapeno", "Produce"), ("black bean", "Canned & Jarred"), ("kidney bean", "Canned & Jarred"),
    ("chickpea", "Canned & Jarred"), ("water", "Beverages"),
]
# "pepper" alone => spice; bell/jalapeno etc => produce (handled by phrase list above + keyword fallback)
_WORD_INDEX = {}
for _sec, _txt in _KW.items():
    for _w in _txt.split():
        _WORD_INDEX.setdefault(_w, _sec)
def classify_section(name: str, unit: str = None) -> str:
    if re.search(r"cooking wine|mirin|rice wine|shaoxing|cooking sherry|wine vinegar", (name or "").lower()):
        return "Pantry"
    if unit in ("can", "jar"):
        return "Canned & Jarred"
    n = (name or "").lower()
    n = re.sub(r"[^a-z0-9' ]", " ", n)
    padded = f" {n} "
    for phrase, sec in _PHRASE_OVERRIDES:
        if re.search(rf" {re.escape(phrase)}(?:e?s)? ", padded):
            return sec
    words = [singularize_word(w) for w in n.split()]
    # last word is usually the head noun
    for w in reversed(words):
        if w in _WORD_INDEX:
            return _WORD_INDEX[w]
    for w in words:
        for k, sec in _WORD_INDEX.items():
            if len(k) > 4 and k in w:
                return sec
    return "Other"
