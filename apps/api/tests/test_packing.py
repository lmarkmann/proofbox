from proofbox_api.packing import Item, Order, TrackPoint, count_tracks, judge

ORDER = Order(
    order_id="PB-1002",
    customer="Oakline Studio",
    items=[Item(name="water bottle", qty=2), Item(name="notebook", qty=1)],
)


def point(track: int | None, label: str) -> TrackPoint:
    return TrackPoint(
        t_ms=0, track=track, label=label, conf=0.9, box=(0, 0, 1, 1)
    )


def test_counts_unique_track_ids_per_label_and_ignores_untracked_boxes():
    track = [
        point(1, "water bottle"),
        point(1, "water bottle"),
        point(4, "water bottle"),
        point(None, "water bottle"),
        point(None, "notebook"),
    ]
    assert count_tracks(track) == {"water bottle": 2}


def test_short_when_any_item_is_under_quantity():
    assert judge(ORDER, {"water bottle": 1, "notebook": 1}) == "short"


def test_short_wins_over_unexpected():
    assert judge(ORDER, {"water bottle": 1, "banana": 1}) == "short"


def test_unexpected_when_a_label_outside_the_order_was_seen():
    counts = {"water bottle": 2, "notebook": 1, "banana": 1}
    assert judge(ORDER, counts) == "unexpected"


def test_complete_when_every_item_is_met():
    assert judge(ORDER, {"water bottle": 3, "notebook": 1}) == "complete"
