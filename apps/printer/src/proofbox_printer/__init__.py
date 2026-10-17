from importlib.metadata import version
from io import BytesIO

import uvicorn
from fastapi import FastAPI, HTTPException, Response
from PIL import Image
from pydantic import BaseModel, Field

from proofbox_printer import jd268bt, label, tspl

app = FastAPI(title="ProofBox printer", version=version("proofbox-printer"))


class Label(BaseModel):
    order_id: str = Field(min_length=1, max_length=40)
    proof_url: str = Field(min_length=1, max_length=300)
    lines: list[str] = Field(default=[], max_length=3)

    def render(self) -> Image.Image:
        return label.render(self.order_id, self.proof_url, self.lines)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": app.version,
        "printer": "connected" if jd268bt.find() else "missing",
    }


@app.post(
    "/labels/preview",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
def preview_label(body: Label) -> Response:
    png = BytesIO()
    body.render().save(png, "PNG")
    return Response(png.getvalue(), media_type="image/png")


@app.post("/labels", status_code=204)
def print_label(body: Label) -> None:
    try:
        jd268bt.send(tspl.encode(body.render()))
    except jd268bt.PrinterMissingError as error:
        raise HTTPException(503, str(error)) from error
    except jd268bt.PrinterBusyError as error:
        raise HTTPException(409, str(error)) from error


def main() -> None:
    uvicorn.run("proofbox_printer:app", port=8001, reload=True)
