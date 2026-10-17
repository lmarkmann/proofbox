from importlib.metadata import version

import uvicorn
from fastapi import FastAPI

app = FastAPI(title="ProofBox", version=version("proofbox-api"))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


def main() -> None:
    uvicorn.run("proofbox_api:app", port=8000, reload=True)
