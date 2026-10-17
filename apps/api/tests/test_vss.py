import asyncio
import json

import httpx

from proofbox_api.vss import VSS


def test_relogs_in_once_when_the_cached_token_expires():
    logins = 0
    seen_tokens = []

    def backend(request: httpx.Request) -> httpx.Response:
        nonlocal logins
        if request.url.path == "/api/v1/auth/login":
            logins += 1
            assert json.loads(request.content) == {
                "username": "team-15",
                "password": "pw",
            }
            return httpx.Response(200, json={"access_token": f"jwt-{logins}"})
        token = request.headers["Authorization"].removeprefix("Bearer ")
        seen_tokens.append(token)
        if token == "jwt-1":
            return httpx.Response(401, json={"detail": "expired"})
        return httpx.Response(200, json={"answer": "ok", "evidence": {}})

    async def search() -> dict:
        async with httpx.AsyncClient(
            base_url="http://vss", transport=httpx.MockTransport(backend)
        ) as http:
            vss = VSS(http, "team-15", "pw")
            await vss.login()
            return await vss.search_and_answer("mug", ["PB-1001"])

    assert asyncio.run(search()) == {"answer": "ok", "evidence": {}}
    assert logins == 2
    assert seen_tokens == ["jwt-1", "jwt-2"]
