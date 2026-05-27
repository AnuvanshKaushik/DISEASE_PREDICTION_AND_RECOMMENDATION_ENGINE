import csv
import json
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request, send_from_directory


os.environ.setdefault("CUDA_VISIBLE_DEVICES", "-1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

BASE_DIR = Path(__file__).resolve().parent.parent
CLIENT_DIR = BASE_DIR / "client"
MODEL_DIR = BASE_DIR / "model"
DATASET_PATH = BASE_DIR / "Dataset" / "Final_Augmented_dataset_Diseases_and_Symptoms.csv"
DESCRIPTION_PATH = BASE_DIR / "Dataset" / "Description.csv"
METADATA_PATH = MODEL_DIR / "metadata.json"

MODEL_CACHE: Dict[str, Any] = {
    "model": None,
    "model_type": None,
    "model_path": None,
    "error": None,
}
MODEL_LOCK = threading.Lock()


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(CLIENT_DIR / "src"), static_url_path="/src")

    symptoms, disease_labels, metadata_error = load_dataset_metadata_safely(
        DATASET_PATH,
        METADATA_PATH,
    )
    descriptions = load_descriptions(DESCRIPTION_PATH)

    app.config["SYMPTOMS"] = symptoms
    app.config["DISEASE_LABELS"] = disease_labels
    app.config["DESCRIPTIONS"] = descriptions
    app.config["METADATA_ERROR"] = metadata_error

    @app.get("/")
    def index():
        return serve_client_or_status()

    @app.get("/health")
    def health():
        return jsonify(health_payload(app))

    @app.get("/api/health")
    def api_health():
        payload = health_payload(app)
        payload["compatibilityRoute"] = True
        return jsonify(payload)

    @app.get("/metadata")
    def metadata():
        payload, status = metadata_payload(app)
        return jsonify(payload), status

    @app.get("/api/metadata")
    def api_metadata():
        payload, status = metadata_payload(app)
        return jsonify(payload), status

    @app.get("/api/history")
    def api_history():
        return jsonify([])

    @app.post("/predict")
    def predict():
        payload = request.get_json(silent=True) or {}
        response_payload, status = prediction_payload(app, payload)
        return jsonify(response_payload), status

    @app.post("/api/predict")
    def api_predict():
        payload = request.get_json(silent=True) or {}
        response_payload, status = prediction_payload(app, payload)
        return jsonify(response_payload), status

    @app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unknown_api_route(_path):
        return jsonify({"error": "API route not found"}), 404

    @app.get("/<path:path>")
    def client_fallback(path):
        requested_file = CLIENT_DIR / path
        if requested_file.is_file():
            return send_from_directory(CLIENT_DIR, path)
        return serve_client_or_status()

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception("Unhandled application error")
        return jsonify({"error": "Unexpected server error", "details": str(error)}), 500

    return app


def serve_client_or_status():
    if (CLIENT_DIR / "index.html").exists():
        return send_from_directory(CLIENT_DIR, "index.html")

    return jsonify(
        {
            "status": "ok",
            "service": "ml-service",
            "message": "ML service is live.",
            "endpoints": [
                "/health",
                "/metadata",
                "/predict",
                "/api/health",
                "/api/metadata",
                "/api/history",
                "/api/predict",
            ],
        }
    )


def health_payload(app: Flask) -> Dict[str, Any]:
    model_path = find_model_path(MODEL_DIR)
    payload = {
        "status": "ok",
        "service": "ml-service",
        "metadataLoaded": app.config["METADATA_ERROR"] is None,
        "modelAvailable": model_path is not None,
        "modelLoaded": MODEL_CACHE["model"] is not None,
        "modelPath": str(model_path) if model_path else None,
        "featureCount": len(app.config["SYMPTOMS"]),
        "diseaseCount": len(app.config["DISEASE_LABELS"]),
    }

    if app.config["METADATA_ERROR"]:
        payload["metadataError"] = app.config["METADATA_ERROR"]
    if MODEL_CACHE["error"]:
        payload["modelLoadError"] = MODEL_CACHE["error"]

    return payload


def metadata_payload(app: Flask) -> Tuple[Dict[str, Any], int]:
    if app.config["METADATA_ERROR"]:
        return {
            "error": "Metadata is not available",
            "details": app.config["METADATA_ERROR"],
        }, 503

    return {
        "symptoms": app.config["SYMPTOMS"],
        "diseaseCount": len(app.config["DISEASE_LABELS"]),
        "modelPath": str(find_model_path(MODEL_DIR)) if find_model_path(MODEL_DIR) else None,
    }, 200


def prediction_payload(app: Flask, payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    if app.config["METADATA_ERROR"]:
        return {
            "error": "Metadata is not available",
            "details": app.config["METADATA_ERROR"],
        }, 503

    try:
        feature_vector = build_feature_vector(payload, app.config["SYMPTOMS"])
        model, model_type, _model_path = get_model_artifact(MODEL_DIR)
        probabilities = run_inference(model, model_type, feature_vector)
    except ValueError as exc:
        return {"error": str(exc)}, 400
    except FileNotFoundError as exc:
        return {"error": "Model file was not found", "details": str(exc)}, 503
    except ImportError as exc:
        return {"error": "Model dependency is not available", "details": str(exc)}, 503
    except RuntimeError as exc:
        return {"error": "Model could not be loaded", "details": str(exc)}, 503
    except Exception as exc:  # pragma: no cover
        return {"error": "Prediction failed", "details": str(exc)}, 500

    labels = app.config["DISEASE_LABELS"]
    descriptions = app.config["DESCRIPTIONS"]
    top_indices = probabilities.argsort()[::-1][:5]
    top_predictions = []

    for index in top_indices:
        if index >= len(labels):
            continue

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

    if not top_predictions:
        return {"error": "Prediction returned no disease labels."}, 500

    return {
        "prediction": top_predictions[0],
        "topPredictions": top_predictions,
        "selectedSymptoms": payload.get("symptoms", []),
    }, 200


def find_model_path(model_dir: Path) -> Path | None:
    candidates = [
        model_dir / "model.pkl",
        model_dir / "model.joblib",
        model_dir / "optimized_disease_prediction_model.h5",
        model_dir / "model.h5",
    ]

    return next((path for path in candidates if path.exists()), None)


def get_model_artifact(model_dir: Path):
    if MODEL_CACHE["model"] is not None:
        return MODEL_CACHE["model"], MODEL_CACHE["model_type"], MODEL_CACHE["model_path"]

    with MODEL_LOCK:
        if MODEL_CACHE["model"] is not None:
            return MODEL_CACHE["model"], MODEL_CACHE["model_type"], MODEL_CACHE["model_path"]

        model_path = find_model_path(model_dir)
        if model_path is None:
            raise FileNotFoundError(
                f"No supported model file found in {model_dir}. "
                "Expected model.pkl, model.joblib, optimized_disease_prediction_model.h5, or model.h5."
            )

        try:
            model, model_type = load_model_file(model_path)
        except Exception as exc:
            MODEL_CACHE["error"] = str(exc)
            raise RuntimeError(str(exc)) from exc

        MODEL_CACHE["model"] = model
        MODEL_CACHE["model_type"] = model_type
        MODEL_CACHE["model_path"] = str(model_path)
        MODEL_CACHE["error"] = None

        return MODEL_CACHE["model"], MODEL_CACHE["model_type"], MODEL_CACHE["model_path"]


def load_model_file(model_path: Path):
    suffix = model_path.suffix.lower()

    if suffix in {".pkl", ".joblib"}:
        import joblib

        return joblib.load(model_path), "sklearn"

    if suffix == ".h5":
        from tensorflow.keras.models import load_model

        return load_model(model_path, compile=False), "keras"

    raise ValueError(f"Unsupported model format: {model_path.name}")


def load_dataset_metadata_safely(
    dataset_path: Path,
    metadata_path: Path,
) -> Tuple[List[str], List[str], str | None]:
    try:
        symptoms, disease_labels = load_dataset_metadata(dataset_path, metadata_path)
        return symptoms, disease_labels, None
    except Exception as exc:
        return [], [], str(exc)


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
    if not description_path.exists():
        return description_map

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


def build_feature_vector(payload: Dict[str, Any], symptoms: List[str]):
    import numpy as np

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


def run_inference(model, model_type: str, feature_vector):
    import numpy as np

    if model_type == "keras":
        probabilities = model.predict(feature_vector, verbose=0)[0]
        return np.asarray(probabilities, dtype=np.float32)

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(feature_vector)[0]
        return np.asarray(probabilities, dtype=np.float32)

    prediction = model.predict(feature_vector)
    classes = list(getattr(model, "classes_", []))
    probabilities = np.zeros(len(classes), dtype=np.float32)

    if classes:
        class_label = prediction[0]
        class_index = classes.index(class_label) if class_label in classes else int(class_label)
        probabilities[class_index] = 1.0

    return probabilities


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 10000))
    app.run(host=host, port=port, debug=False)
