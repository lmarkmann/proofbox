from importlib.metadata import version

import uvicorn
from fastapi import FastAPI

from proofbox_api.middleware import install

app = FastAPI(title="ProofBox", version=version("proofbox-api"))
install(app)


@app.get("/health")
@app.get("/api/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


def main() -> None:
    uvicorn.run("proofbox_api:app", port=8000, reload=True)
