import os, sys, tempfile
from pathlib import Path
os.environ["FORKCAST_DATA"] = tempfile.mkdtemp()
os.environ["FORKCAST_SHARE_TOKEN"] = "secret"
os.environ.pop("FORKCAST_AI_ENABLED", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from app.main import app
    return TestClient(app)
