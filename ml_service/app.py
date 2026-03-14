import csv
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
from flask import Flask, jsonify, request


BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "model"
DATASET_PATH = BASE_DIR / "Dataset" / "Final_Augmented_dataset_Diseases_and_Symptoms.csv"
DESCRIPTION_PATH = BASE_DIR / "Dataset" / "Description.csv"
METADATA_PATH = MODEL_DIR / "metadata.json"


def create_app() -> Flask:
    app = Flask(__name__)

    model, model_type, model_path = load_model_artifact(MODEL_DIR)
    symptoms, disease_labels = load_dataset_metadata(DATASET_PATH, METADATA_PATH)
    descriptions = load_descriptions(DESCRIPTION_PATH)

    app.config["MODEL"] = model
    app.config["MODEL_TYPE"] = model_type
    app.config["MODEL_PATH"] = str(model_path)
    app.config["SYMPTOMS"] = symptoms
    app.config["DISEASE_LABELS"] = disease_labels
    app.config["DESCRIPTIONS"] = descriptions

    warm_up_model(model, model_type, len(symptoms))

    @app.get("/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "service": "ml-service",
                "modelLoaded": True,
                "modelType": app.config["MODEL_TYPE"],
                "featureCount": len(app.config["SYMPTOMS"]),
                "diseaseCount": len(app.config["DISEASE_LABELS"]),
            }
        )

    @app.get("/metadata")
    def metadata():
        return jsonify(
            {
                "symptoms": app.config["SYMPTOMS"],
                "diseaseCount": len(app.config["DISEASE_LABELS"]),
                "modelPath": app.config["MODEL_PATH"],
            }
        )

    @app.post("/predict")
    def predict():
        payload = request.get_json(silent=True) or {}

        try:
            feature_vector = build_feature_vector(payload, app.config["SYMPTOMS"])
            probabilities = run_inference(
                app.config["MODEL"], app.config["MODEL_TYPE"], feature_vector
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": f"Prediction failed: {exc}"}), 500

        top_indices = np.argsort(probabilities)[::-1][:5]
        labels = app.config["DISEASE_LABELS"]
        descriptions = app.config["DESCRIPTIONS"]

        top_predictions = []
        for index in top_indices:
            disease_name = labels[index]
            disease_meta = descriptions.get(disease_name, {})
            top_predictions.append(
                {
                    "disease": disease_name,
                    "confidence": round(float(probabilities[index]) * 100, 2),
                    "description": disease_meta.get(
                        "description",
                        "No description available for this disease.",
                    ),
                    "precautions": disease_meta.get(
                        "precautions",
                        "Consult a qualified medical professional for next steps.",
                    ),
                    "specialist": disease_meta.get(
                        "specialist",
                        "Primary care physician",
                    ),
                }
            )

        return jsonify(
            {
                "prediction": top_predictions[0],
                "topPredictions": top_predictions,
                "selectedSymptoms": payload.get("symptoms", []),
            }
        )

    return app


def load_model_artifact(model_dir: Path):
    candidates = [
        model_dir / "model.pkl",
        model_dir / "model.joblib",
        model_dir / "optimized_disease_prediction_model.h5",
        model_dir / "model.h5",
    ]

    model_path = next((path for path in candidates if path.exists()), None)
    if model_path is None:
        raise FileNotFoundError(
            f"No supported model file found in {model_dir}. "
            "Expected model.pkl, model.joblib, optimized_disease_prediction_model.h5, or model.h5."
        )

    suffix = model_path.suffix.lower()
    if suffix in {".pkl", ".joblib"}:
        return joblib.load(model_path), "sklearn", model_path

    if suffix == ".h5":
        try:
            from tensorflow.keras.models import load_model  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise ImportError(
                "TensorFlow is required to load the current .h5 model artifact."
            ) from exc

        return load_model(model_path, compile=False), "keras", model_path

    raise ValueError(f"Unsupported model format: {model_path.name}")


def load_dataset_metadata(dataset_path: Path, metadata_path: Path) -> Tuple[List[str], List[str]]:
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        symptoms = metadata.get("symptoms", [])
        disease_labels = metadata.get("disease_labels", [])
        if symptoms and disease_labels:
            return symptoms, disease_labels

    with dataset_path.open(newline="", encoding="utf-8") as dataset_file:
        reader = csv.DictReader(dataset_file)
        if not reader.fieldnames or reader.fieldnames[0] != "diseases":
            raise ValueError("Dataset format is invalid. Expected first column to be 'diseases'.")

        symptoms = reader.fieldnames[1:]
        disease_labels = sorted({row["diseases"] for row in reader if row["diseases"]})

    return symptoms, disease_labels


def load_descriptions(description_path: Path) -> Dict[str, Dict[str, str]]:
    description_map: Dict[str, Dict[str, str]] = {}
    with description_path.open(newline="", encoding="utf-8") as description_file:
        reader = csv.DictReader(description_file)
        for row in reader:
            disease_name = (row.get("Disease Name") or "").strip()
            if not disease_name:
                continue
            description_map[disease_name] = {
                "description": (row.get("Short Description") or "").strip(),
                "precautions": (row.get("General Precautions") or "").strip(),
                "specialist": (row.get("Recommended Doctor / Specialist") or "").strip(),
            }

    return description_map


def build_feature_vector(payload: Dict, symptoms: List[str]) -> np.ndarray:
    symptom_index = {symptom: idx for idx, symptom in enumerate(symptoms)}
    vector = np.zeros(len(symptoms), dtype=np.float32)

    selected_symptoms = payload.get("symptoms", [])
    feature_values = payload.get("featureValues", {})

    if selected_symptoms and not isinstance(selected_symptoms, list):
        raise ValueError("'symptoms' must be an array of symptom names.")
    if feature_values and not isinstance(feature_values, dict):
        raise ValueError("'featureValues' must be an object of symptom-value pairs.")

    unknown_symptoms = [item for item in selected_symptoms if item not in symptom_index]
    unknown_symptoms.extend(
        [item for item in feature_values.keys() if item not in symptom_index]
    )
    if unknown_symptoms:
        unique_unknown = sorted(set(unknown_symptoms))
        raise ValueError(f"Unknown symptoms received: {', '.join(unique_unknown[:10])}")

    for symptom in selected_symptoms:
        vector[symptom_index[symptom]] = 1.0

    for symptom, value in feature_values.items():
        vector[symptom_index[symptom]] = 1.0 if bool(value) else 0.0

    if not np.any(vector):
        raise ValueError("Please select at least one symptom.")

    return vector.reshape(1, -1)


def run_inference(model, model_type: str, feature_vector: np.ndarray) -> np.ndarray:
    if model_type == "keras":
        probabilities = model.predict(feature_vector, verbose=0)[0]
        return np.asarray(probabilities, dtype=np.float32)

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(feature_vector)[0]
        return np.asarray(probabilities, dtype=np.float32)

    prediction = model.predict(feature_vector)
    class_index = int(prediction[0])
    probabilities = np.zeros(len(model.classes_), dtype=np.float32)
    probabilities[class_index] = 1.0
    return probabilities


def warm_up_model(model, model_type: str, feature_count: int) -> None:
    try:
        zero_vector = np.zeros((1, feature_count), dtype=np.float32)
        run_inference(model, model_type, zero_vector)
    except Exception as exc:  # pragma: no cover
        print(f"Model warm-up skipped: {exc}")


app = create_app()


if __name__ == "__main__":
    host = os.getenv("ML_SERVICE_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("ML_SERVICE_PORT", "8000")))
    app.run(host=host, port=port, debug=False)
