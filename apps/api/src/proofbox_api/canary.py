import httpx


async def transcribe(http: httpx.AsyncClient, wav: bytes) -> str:
    response = await http.post(
        "/v1/audio/transcriptions",
        files={"file": ("question.wav", wav, "audio/wav")},
        data={"language": "en-US"},
    )
    response.raise_for_status()
    return response.json()["text"]
