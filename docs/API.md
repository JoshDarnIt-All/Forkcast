# Forkcast — shared build contract

Family meal planner: recipe book, meal plans, shopping lists. Self-hosted, one Docker container.
Owner: Josh (first-time programmer; wants it simple, reliable, "wife-approved", modern editorial look).

## Architecture (fixed — do not change)
- **Backend:** Python 3.12+, FastAPI, SQLite (single file at `$FORKCAST_DATA/forkcast.db`), `recipe-scrapers` for imports. Code in `backend/app/`.
- **Frontend:** static SPA, **no build step** (vanilla JS ES modules + CSS, no npm). Lives in `frontend/`, served by FastAPI at `/`. Installable PWA (manifest, service worker, apple-touch-icon). Mobile-first (iPhone), also fine on tablet/desktop.
- **Packaging:** one `Dockerfile` (multi-arch friendly, linux/amd64 + arm64), `docker-compose.yml`, data volume at `/data`.
- Env vars: `FORKCAST_DATA` (default `./data`), `FORKCAST_SHARE_TOKEN` (for /api/share), `FORKCAST_AI_ENABLED` (default false).
- All JSON. Errors: HTTP status + `{"detail": "human message", "code": "machine_code"}`.
- No passwords. Identity = "profile" chosen client-side, sent as header `X-Profile-Id` (optional). Auth for remote access is handled outside the app (Cloudflare Access).

## Data shapes
**Recipe**
```
{id, title, source_url, image_url (e.g. "/media/abc.jpg" or null), description,
 servings (int|null), prep_min, cook_min, total_min (int|null),
 category: "breakfast"|"lunch"|"dinner"|"snack"|"dessert"|"drink"|"other",
 tags: [str], favorite: bool, notes: str, added_by: profile_id|null, created_at,
 ingredients: [{raw, quantity (float|null), unit (str|null), name, section}],
 steps: [str]}
```
`section` is a store section, one of (in shopping order):
`Produce, Meat & Seafood, Dairy & Eggs, Bakery, Frozen, Pantry, Canned & Jarred, Spices & Baking, Beverages, Snacks, Household, Other`

**MealPlan** `{id, name, status: "draft"|"saved", created_at, items: [{id, recipe_id, recipe (summary: id,title,image_url,category), day (0-6|null, Mon=0), meal ("breakfast"|"lunch"|"dinner"|"snack"|null), servings_multiplier (float, default 1)}]}`
There is always exactly one `draft` plan = "the next meal plan".

**ShoppingItem** `{id, plan_id, name, quantity (float|null), unit, section, checked: bool, owned: bool, recipe_ids: [int], custom: bool}`

**Profile** `{id, name, color}`

## Endpoints
Health/meta
- `GET /api/health` → `{ok:true, version}`
- `GET /api/config` → `{ai_enabled: bool, sections: [...ordered store sections], categories: [...]}`

Profiles
- `GET /api/profiles`, `POST /api/profiles {name,color}`, `DELETE /api/profiles/{id}` (seed two defaults on first run: "Josh", "Wife" — colors from the palette)

Recipes
- `GET /api/recipes?q=&category=&tag=&favorite=true&sort=recent|title` → `[Recipe]` (list may omit steps/ingredients but must include everything the cards need)
- `GET /api/recipes/{id}` · `POST /api/recipes` (manual create) · `PUT /api/recipes/{id}` · `DELETE /api/recipes/{id}`
- `POST /api/recipes/import {url?: str, text?: str}` → `Recipe` (201). Pipeline: recipe-scrapers (wild mode, any site) → fallback to JSON-LD/schema.org parse of the page → fallback error `{code:"scrape_failed"}` with detail suggesting paste-text. If `text` given and AI disabled, do best-effort heuristic parse of pasted text (title line, "Ingredients", "Instructions" headings). Downloads the image into `$FORKCAST_DATA/images`, served at `/media/<file>`. Auto-assign `category`, `tags` (cuisine/diet/protein keywords) and ingredient `section` with rule-based code. De-dupe by `source_url` (return existing recipe with 200).
- `POST /api/share {url}` with header `X-Share-Token` — same as import but for the iPhone Shortcut; returns `{ok:true, recipe_id, title}` quickly and is tolerant of tracking params. Reject bad token with 401.

Meal plans
- `GET /api/plans` (saved plans, newest first, with `item_count`) · `GET /api/plans/current` (the draft) · `GET /api/plans/{id}`
- `POST /api/plans/current/items {recipe_id, day?, meal?}` ("Add to next meal plan"; idempotent per recipe+day+meal) · `PATCH /api/plans/items/{item_id} {day?, meal?, servings_multiplier?}` · `DELETE /api/plans/items/{item_id}`
- `POST /api/plans/current/save {name}` → saves the draft as `saved`, creates a fresh empty draft, returns the saved plan
- `POST /api/plans/{id}/reuse` → copies a saved plan's items into the current draft (replaces draft contents), returns draft
- `PATCH /api/plans/{id} {name}` · `DELETE /api/plans/{id}`

Shopping
- `GET /api/plans/{id}/shopping` → `{plan_id, sections: [{section, items:[ShoppingItem]}]}` — generated on first call (merge duplicate ingredients by normalized name+compatible unit, scale by servings_multiplier vs recipe servings, sum quantities, track recipe_ids), persisted so check/owned state survives; regenerated (preserving checked/owned/custom items) when plan items change. Sections returned in store order; empty sections omitted. Owned items sort to bottom, checked items struck through client-side.
- `PATCH /api/shopping/items/{id} {checked?, owned?, name?, quantity?}` · `POST /api/plans/{id}/shopping/items {name, quantity?, unit?, section?}` (custom) · `DELETE /api/shopping/items/{id}` (custom only) · `POST /api/plans/{id}/shopping/clear-checked`
- Persist `owned` by normalized ingredient name globally in table `owned_names` so "already have it" is remembered for future lists (`PATCH` with owned toggles that); `GET /api/pantry` → list of owned names, `DELETE /api/pantry/{name}`.

Suggestions (AI — built but OFF by default)
- `GET /api/suggestions?kind=snack|lunch|dinner|breakfast` → `{enabled: false, items: []}` when disabled. When enabled, call a pluggable provider (`backend/app/ai/` with a `Provider` interface; implement an `OpenAICompatibleProvider` (works with Ollama/LM Studio/etc. via `FORKCAST_AI_BASE_URL`, `FORKCAST_AI_MODEL`, optional `FORKCAST_AI_KEY`) and an `AnthropicProvider` stub). Items are recipe-shaped drafts the user can "save to book" via `POST /api/recipes`.
- AI also powers `POST /api/recipes/import {text}` when enabled (extract recipe from video captions/social text).

## Repo layout
```
forkcast/
  backend/app/{main.py,db.py,models.py,routers/,services/,ai/}  backend/requirements.txt  backend/tests/
  frontend/{index.html,manifest.webmanifest,sw.js,css/,js/,icons/}
  Dockerfile  docker-compose.yml  README.md  docs/{API.md,DEPLOY.md,SHORTCUT.md}
```
