from base64 import b64encode
from pathlib import Path

import httpx


class Cosmos:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self.model: str | None = None

    async def model_id(self) -> str:
        if self.model is None:
            response = await self.http.get("/v1/models")
            response.raise_for_status()
            self.model = response.json()["data"][0]["id"]
        return self.model

    async def watch(self, clip: Path, prompt: str) -> str:
        mime = "video/webm" if clip.suffix == ".webm" else "video/mp4"
        video = b64encode(clip.read_bytes()).decode()
        response = await self.http.post(
            "/v1/chat/completions",
            json={
                "model": await self.model_id(),
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "video_url",
                                "video_url": {
                                    "url": f"data:{mime};base64,{video}"
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
                "max_tokens": 1024,
                "temperature": 0,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
