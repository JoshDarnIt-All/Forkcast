# Forkcast — your dinner forecast

A self-hosted family recipe book, meal planner and shopping list. Share a recipe link from your phone and Forkcast saves a clean local copy. Tick "Add to next meal plan" on the ones you want, then get a shopping list that merges duplicates and groups items by store section.

- **Recipe book:** import from a link (most recipe sites) or pasted text; search, categories, tags, favorites.
- **Meal plans:** build the next plan, save it, reuse it later.
- **Shopping lists:** merged quantities, store-section grouping, check-off, "I already have this" (remembered).
- **Installable web app** for iPhone/Android/desktop; no accounts or passwords inside the app.
- **Optional AI ideas** (off by default): connects to a local or compatible model for snack/lunch suggestions and social-post imports.
- Everything lives in one `data/` folder you can back up. No cloud service required.

## Run it
**Docker (recommended):**
```bash
git clone https://github.com/JoshDarnIt-All/Forkcast.git && cd Forkcast
mkdir -p data && sudo chown 1000:1000 data
echo "FORKCAST_SHARE_TOKEN=$(openssl rand -hex 24)" > .env
docker compose up -d --build
```
Open http://localhost:8000.

**Without Docker (testing):** needs Python 3.12+.
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
./run-local.sh        # http://localhost:8765
```

## Docs
- [docs/DEPLOY.md](docs/DEPLOY.md) — server setup, remote access with Cloudflare Tunnel, backups, optional AI
- [docs/SHORTCUT.md](docs/SHORTCUT.md) — one-tap "Send to Forkcast" from the iPhone Share sheet
- [docs/API.md](docs/API.md) — architecture and API contract

## Security notes
Forkcast has no login of its own. Keep it on your home network, or put it behind something like Cloudflare Access or Tailscale before exposing it. Set your own `FORKCAST_SHARE_TOKEN`; never commit your `.env`.

Some recipe sites block automated downloads. When that happens, Forkcast asks you to paste the recipe text instead.
