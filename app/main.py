from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bert_service import load_model, predict


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


app = FastAPI(title="BERT End-of-Turn API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClassifyRequest(BaseModel):
    text: str


@app.post("/classify")
async def classify(request: ClassifyRequest):
    result = predict(request.text.strip())
    return result


@app.get("/health")
async def health():
    return {"status": "ok"}
