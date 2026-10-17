import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import pyarrow as pa
import vastdb
from ibis import _
from vastdb.table import ITable

from proofbox_api.packing import Check, Item, Order, Pack, TrackPoint

SCHEMA = "proofbox"

TABLES = {
    "orders": pa.schema(
        [
            ("order_id", pa.utf8()),
            ("customer", pa.utf8()),
            ("items", pa.utf8()),
            ("created_at", pa.timestamp("us")),
        ]
    ),
    "packs": pa.schema(
        [
            ("pack_id", pa.utf8()),
            ("order_id", pa.utf8()),
            ("started_at", pa.timestamp("us")),
            ("sealed_at", pa.timestamp("us")),
            ("object_key", pa.utf8()),
            ("counts", pa.utf8()),
            ("verdict", pa.utf8()),
        ]
    ),
    "summaries": pa.schema(
        [
            ("pack_id", pa.utf8()),
            ("text", pa.utf8()),
            ("created_at", pa.timestamp("us")),
        ]
    ),
    "checks": pa.schema(
        [
            ("pack_id", pa.utf8()),
            ("verdict", pa.utf8()),
            ("text", pa.utf8()),
            ("created_at", pa.timestamp("us")),
        ]
    ),
    "detections": pa.schema(
        [
            ("pack_id", pa.utf8()),
            ("t_ms", pa.int64()),
            ("track", pa.int32()),
            ("label", pa.utf8()),
            ("conf", pa.float32()),
            ("x1", pa.float32()),
            ("y1", pa.float32()),
            ("x2", pa.float32()),
            ("y2", pa.float32()),
        ]
    ),
}


def utc(naive: datetime) -> datetime:
    return naive.replace(tzinfo=UTC)


def order_from_row(row: dict[str, Any]) -> Order:
    return Order(
        order_id=row["order_id"],
        customer=row["customer"],
        items=json.loads(row["items"]),
    )


def pack_from_row(row: dict[str, Any]) -> Pack:
    return Pack(
        pack_id=row["pack_id"],
        order_id=row["order_id"],
        started_at=utc(row["started_at"]),
        sealed_at=utc(row["sealed_at"]),
        object_key=row["object_key"],
        counts=json.loads(row["counts"]),
        verdict=row["verdict"],
    )


class Store:
    def __init__(self, endpoint: str, access: str, secret: str, bucket: str):
        self.session = vastdb.connect(
            endpoint=endpoint, access=access, secret=secret, ssl_verify=False
        )
        self.bucket = bucket

    @contextmanager
    def table(self, name: str) -> Iterator[ITable]:
        with self.session.transaction() as tx:
            yield tx.bucket(self.bucket).schema(SCHEMA).table(name)

    def select(self, name: str, predicate: Any = None) -> list[dict[str, Any]]:
        with self.table(name) as table:
            return table.select(predicate=predicate).read_all().to_pylist()

    def create_tables(self) -> None:
        with self.session.transaction() as tx:
            bucket = tx.bucket(self.bucket)
            schema = bucket.schema(SCHEMA, fail_if_missing=False)
            if schema is None:
                schema = bucket.create_schema(SCHEMA)
            for name, columns in TABLES.items():
                if schema.table(name, fail_if_missing=False) is None:
                    schema.create_table(name, columns)

    def seed_orders(self, orders: list[Order]) -> list[str]:
        existing = {row["order_id"] for row in self.select("orders")}
        missing = [order for order in orders if order.order_id not in existing]
        if missing:
            now = datetime.now(UTC).replace(tzinfo=None)
            rows = [
                {
                    "order_id": order.order_id,
                    "customer": order.customer,
                    "items": json.dumps(
                        [item.model_dump() for item in order.items]
                    ),
                    "created_at": now,
                }
                for order in missing
            ]
            with self.table("orders") as table:
                table.insert(pa.Table.from_pylist(rows, TABLES["orders"]))
        return [order.order_id for order in missing]

    def orders(self) -> list[Order]:
        rows = sorted(self.select("orders"), key=lambda row: row["order_id"])
        return [order_from_row(row) for row in rows]

    def order(self, order_id: str) -> Order | None:
        rows = self.select("orders", _.order_id == order_id)
        return order_from_row(rows[0]) if rows else None

    def set_items(self, order_id: str, items: list[Item]) -> None:
        with self.table("orders") as table:
            found = table.select(
                columns=["order_id"],
                predicate=_.order_id == order_id,
                internal_row_id=True,
            ).read_all()
            encoded = json.dumps([item.model_dump() for item in items])
            table.update(
                pa.table(
                    {
                        "$row_id": found["$row_id"],
                        "items": pa.array(
                            [encoded] * found.num_rows, pa.utf8()
                        ),
                    }
                )
            )

    def packs(self, order_id: str) -> list[Pack]:
        rows = self.select("packs", _.order_id == order_id)
        return sorted(map(pack_from_row, rows), key=lambda pack: pack.sealed_at)

    def pack(self, pack_id: str) -> Pack | None:
        rows = self.select("packs", _.pack_id == pack_id)
        return pack_from_row(rows[0]) if rows else None

    def recent_packs(self, limit: int) -> list[Pack]:
        packs = map(pack_from_row, self.select("packs"))
        return sorted(packs, key=lambda pack: pack.sealed_at, reverse=True)[
            :limit
        ]

    def packs_by_object_key(self) -> dict[str, Pack]:
        return {
            row["object_key"]: pack_from_row(row)
            for row in self.select("packs")
            if row["object_key"]
        }

    def insert_pack(self, pack: Pack, track: list[TrackPoint]) -> None:
        pack_row = pack.model_dump(exclude={"counts"}) | {
            "started_at": pack.started_at.astimezone(UTC).replace(tzinfo=None),
            "sealed_at": pack.sealed_at.astimezone(UTC).replace(tzinfo=None),
            "counts": json.dumps(pack.counts),
        }
        detection_rows = [
            {
                "pack_id": pack.pack_id,
                "t_ms": point.t_ms,
                "track": point.track,
                "label": point.label,
                "conf": point.conf,
                "x1": point.box[0],
                "y1": point.box[1],
                "x2": point.box[2],
                "y2": point.box[3],
            }
            for point in track
        ]
        with self.session.transaction() as tx:
            schema = tx.bucket(self.bucket).schema(SCHEMA)
            schema.table("packs").insert(
                pa.Table.from_pylist([pack_row], TABLES["packs"])
            )
            if detection_rows:
                schema.table("detections").insert(
                    pa.Table.from_pylist(detection_rows, TABLES["detections"])
                )

    def insert_summary(self, pack_id: str, text: str) -> None:
        row = {
            "pack_id": pack_id,
            "text": text,
            "created_at": datetime.now(UTC).replace(tzinfo=None),
        }
        with self.table("summaries") as table:
            table.insert(pa.Table.from_pylist([row], TABLES["summaries"]))

    def summary(self, pack_id: str) -> str | None:
        rows = self.select("summaries", _.pack_id == pack_id)
        return (
            max(rows, key=lambda row: row["created_at"])["text"]
            if rows
            else None
        )

    def insert_check(self, check: Check) -> None:
        row = check.model_dump() | {
            "created_at": datetime.now(UTC).replace(tzinfo=None)
        }
        with self.table("checks") as table:
            table.insert(pa.Table.from_pylist([row], TABLES["checks"]))

    def check(self, pack_id: str) -> Check | None:
        rows = self.select("checks", _.pack_id == pack_id)
        if not rows:
            return None
        latest = max(rows, key=lambda row: row["created_at"])
        return Check(
            pack_id=pack_id, verdict=latest["verdict"], text=latest["text"]
        )

    def track(self, pack_id: str) -> list[TrackPoint]:
        rows = sorted(
            self.select("detections", _.pack_id == pack_id),
            key=lambda row: row["t_ms"],
        )
        return [
            TrackPoint(
                t_ms=row["t_ms"],
                track=row["track"],
                label=row["label"],
                conf=row["conf"],
                box=(row["x1"], row["y1"], row["x2"], row["y2"]),
            )
            for row in rows
        ]
