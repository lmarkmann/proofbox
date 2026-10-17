from typing import Any

import httpx


class VSS:
    def __init__(self, http: httpx.AsyncClient, username: str, password: str):
        self.http = http
        self.username = username
        self.password = password
        self.token: str | None = None

    async def login(self) -> str:
        response = await self.http.post(
            "/api/v1/auth/login",
            json={"username": self.username, "password": self.password},
        )
        response.raise_for_status()
        self.token = response.json()["access_token"]
        return self.token

    async def request(self, method: str, url: str, **kwargs: Any) -> Any:
        token = self.token or await self.login()
        response = await self.http.request(
            method, url, headers={"Authorization": f"Bearer {token}"}, **kwargs
        )
        if response.status_code == httpx.codes.UNAUTHORIZED:
            token = await self.login()
            response = await self.http.request(
                method,
                url,
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
        response.raise_for_status()
        return response.json()

    async def upload(
        self,
        filename: str,
        clip: bytes,
        content_type: str,
        tags: list[str],
        custom_prompt: str,
    ) -> str:
        uploaded = await self.request(
            "POST",
            "/api/v1/videos/upload",
            files={"file": (filename, clip, content_type)},
            data={
                "is_public": "false",
                "tags": ",".join(tags),
                "custom_prompt": custom_prompt[:800],
                "camera_id": "bench-1",
                "capture_type": "warehouse",
                "location": "proofbox",
            },
        )
        return uploaded["object_key"]

    async def search_and_answer(
        self, query: str, tags: list[str]
    ) -> dict[str, Any]:
        return await self.request(
            "POST",
            "/api/v1/agent/search-and-answer",
            json={"query": query, "tags": tags, "top_k": 10},
        )
