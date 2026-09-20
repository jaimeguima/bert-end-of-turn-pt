import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_PATH = "JamesGuima/bert-end-of-turn-pt"

tokenizer = None
model = None


def load_model():
    global tokenizer, model
    print("[BERT] Loading tokenizer and model...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
    model.eval()
    print("[BERT] Model loaded.")


def predict(text: str) -> dict:
    if model is None or tokenizer is None:
        load_model()

    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=64,
    )

    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = torch.softmax(logits, dim=-1)
        label = int(torch.argmax(probs, dim=-1).item())
        confidence = float(probs[0][label].item())

    return {"label": label, "confidence": round(confidence, 4)}
