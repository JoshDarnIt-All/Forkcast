import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import errors
from .db import init_db, data_dir, VERSION
from .routers import core, recipes, plans

app = FastAPI(title="Forkcast", version=VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
errors.install(app)
init_db()
for r in (core.router, recipes.router, plans.router):
    app.include_router(r)

app.mount("/media", StaticFiles(directory=data_dir() / "images"), name="media")

FRONTEND = Path(os.environ.get("FORKCAST_FRONTEND", Path(__file__).resolve().parents[2] / "frontend"))


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise errors.ApiError(404, "Unknown API endpoint", "not_found")
    if not FRONTEND.is_dir():
        return {"ok": True, "detail": "Frontend not found; API only."}
    f = (FRONTEND / path).resolve()
    if path and f.is_file() and FRONTEND.resolve() in f.parents:
        return FileResponse(f, headers={"Cache-Control": "no-cache"} if path.endswith(("sw.js", ".html")) else None)
    return FileResponse(FRONTEND / "index.html", headers={"Cache-Control": "no-cache"})
