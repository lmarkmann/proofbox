from PIL import Image

from proofbox_printer import tspl


def test_bitmap_rows_are_packed_with_zero_bits_for_black():
    image = Image.new("1", (16, 1), 1)
    image.putpixel((0, 0), 0)
    job = tspl.encode(image)
    assert b"\r\nBITMAP 0,0,2,1,0,\x7f\xff\r\nPRINT 1,1\r\n" in job


def test_size_plus_gap_is_the_fanfold_pitch():
    assert tspl.LABEL_LENGTH_MM + tspl.GAP_MM == 152.4
