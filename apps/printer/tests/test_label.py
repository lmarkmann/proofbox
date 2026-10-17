import pytest
import zxingcpp
from PIL import ImageOps

from proofbox_printer import label, tspl


@pytest.mark.parametrize(
    "proof_url",
    ["https://proofbox.app/p/7f3k2q", "https://proofbox.app/p/" + "x" * 277],
)
def test_qr_on_the_label_decodes_to_the_proof_url(proof_url):
    rendered = label.render("PB-20481", proof_url, ["3 items"])
    assert rendered.size == tspl.CANVAS
    decoded = zxingcpp.read_barcodes(rendered.convert("L"))
    assert [code.text for code in decoded] == [proof_url]


def test_long_text_shrinks_to_the_margins():
    rendered = label.render("W" * 40, "https://proofbox.app/p/1", ["W" * 80])
    below_rule = rendered.crop((0, 200, *tspl.CANVAS)).convert("L")
    ink = ImageOps.invert(below_rule).getbbox()
    assert ink is not None
    assert ink[0] >= label.MARGIN
    assert ink[2] <= tspl.CANVAS[0] - label.MARGIN
