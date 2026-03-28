from fastapi import FastAPI

app = FastAPI(title="Smart Tutor API")


@app.get("/health")
async def health_check() -> dict:
    return {"status": "online", "version": "0.1.0", "environment": "development"}
