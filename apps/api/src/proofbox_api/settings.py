import os
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).parents[4]


@dataclass(frozen=True)
class Settings:
    ingress_url: str
    username: str
    password: str
    s3_endpoint: str
    access_key: str
    secret_key: str
    vastdb_bucket: str
    chunks_bucket: str
    gpu_bearer_token: str
    cosmos_url: str
    canary_url: str
    wandb_api_key: str
    wandb_team: str
    wandb_project: str
    wandb_model: str
    data_dir: Path
    demo_orders: Path


def read_team_config() -> dict[str, str]:
    configs = sorted(Path("/config").glob("*.config"))
    if len(configs) > 1:
        raise RuntimeError(
            f"expected one /config/*.config, found {len(configs)}"
        )
    values: dict[str, str] = {}
    for path in configs:
        for line in path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.startswith("#"):
                values[key.strip()] = value.strip()
    return values


def load() -> Settings:
    values = read_team_config() | os.environ
    s3_endpoint = values["S3_ENDPOINT"]
    if "://" not in s3_endpoint:
        s3_endpoint = f"http://{s3_endpoint}"
    return Settings(
        ingress_url=values["INGRESS_URL"].rstrip("/"),
        username=values["USERNAME"],
        password=values["PASSWORD"],
        s3_endpoint=s3_endpoint,
        access_key=values["ACCESS_KEY"],
        secret_key=values["SECRET_KEY"],
        vastdb_bucket=values["VASTDB_BUCKET"],
        chunks_bucket=values["S3_CHUNKS_BUCKET"],
        gpu_bearer_token=values["GPU_BEARER_TOKEN"],
        cosmos_url=values.get("COSMOS_URL", "http://166.19.38.112:8001"),
        canary_url=values.get("CANARY_URL", "http://166.19.38.112:8004"),
        wandb_api_key=values["WANDB_API_KEY"],
        wandb_team=values["WANDB_TEAM"],
        wandb_project=values["WANDB_PROJECT"],
        wandb_model=values.get("WANDB_MODEL", "openai/gpt-oss-120b"),
        data_dir=Path(
            values.get("PROOFBOX_DATA", Path.home() / "proofbox-data")
        ),
        demo_orders=REPO / "docs" / "demo-orders.json",
    )
