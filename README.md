# PulsePredict AI

PulsePredict AI is a complete disease prediction and recommendation engine built around your existing trained model.

## Stack

- MongoDB for optional prediction history persistence
- Express + Node.js for the main API
- React for the frontend experience
- Python Flask for the ML inference service that loads the saved model from `model/`

## Project Structure

```text
DiseasePredAndRecEngine/
|-- client/
|   |-- index.html
|   |-- dev-server.js
|   |-- package.json
|   `-- src/
|       |-- App.js
|       |-- main.js
|       `-- styles.css
|-- server/
|   |-- package.json
|   `-- src/
|       |-- app.js
|       |-- index.js
|       |-- config/db.js
|       |-- controllers/predictionController.js
|       |-- models/Prediction.js
|       |-- routes/predictionRoutes.js
|       `-- services/mlService.js
|-- ml_service/
|   |-- app.py
|   `-- requirements.txt
|-- model/
|   `-- optimized_disease_prediction_model.h5
|-- Dataset/
|   |-- Final_Augmented_dataset_Diseases_and_Symptoms.csv
|   `-- Description.csv
`-- .env.example
```

## Features

- Loads the trained model automatically at ML service startup
- Uses React for a polished symptom selection and prediction experience
- Sends prediction requests through Express using REST APIs
- Saves recent prediction history in MongoDB when available
- Shows disease description, precautions, specialist recommendation, and top alternatives

## Run The App

### 1. Start the ML service

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r ml_service\requirements.txt
python ml_service\app.py
```

This runs on `http://127.0.0.1:8000`.

### 2. Start the Express server

```powershell
cd server
npm install
Copy-Item ..\.env.example .env
npm start
```

This runs on `http://localhost:5000`.

### 3. Optional standalone client dev server

```powershell
cd client
npm start
```

This runs on `http://localhost:5173`.

You can also skip the standalone client server and open the app directly from the Express service at `http://localhost:5000`, because the Node app now serves the frontend in production style.

## Deploy On Render

This repository includes [render.yaml](c:/Users/kaush/Downloads/Anuvansh/DiseasePredAndRecEngine/render.yaml) so you can deploy the app as:

- one Node web service for the API and frontend
- one Python web service for the ML model

### Before deploy

1. Push the latest code to GitHub.
2. Create a MongoDB Atlas database if you want persistent prediction history.
3. In Render, create a new Blueprint from this GitHub repo.

### Render environment values

- `MONGODB_URI`: your MongoDB Atlas connection string
- `CLIENT_ORIGIN`: your Render frontend/backend URL, for example `https://pulsepredict-api.onrender.com`

### Render Python version

The ML service requires a TensorFlow-compatible Python version. This repo pins Render to Python `3.13.5` using [.python-version](c:/Users/kaush/Downloads/Anuvansh/DiseasePredAndRecEngine/.python-version) and the `PYTHON_VERSION` setting in [render.yaml](c:/Users/kaush/Downloads/Anuvansh/DiseasePredAndRecEngine/render.yaml).

### Important deployment note

The large training CSV is not needed for deployment anymore. The ML service now reads symptom and label metadata from [model/metadata.json](c:/Users/kaush/Downloads/Anuvansh/DiseasePredAndRecEngine/model/metadata.json), which is lightweight and included in the repo.

## API Endpoints

- `GET /api/health`
- `GET /api/metadata`
- `GET /api/history`
- `POST /api/predict`

Example request:

```json
{
  "symptoms": ["anxiety and nervousness", "shortness of breath", "palpitations"]
}
```

## Notes

- MongoDB is optional. If `MONGODB_URI` is not set or the connection fails, prediction history falls back to non-persistent mode.
- The current model artifact is a TensorFlow `.h5` file, so the Python ML service uses TensorFlow to load it.
- The same ML service also supports `model.pkl` and `model.joblib` if you swap the model later.
- The large dataset file `Dataset/Final_Augmented_dataset_Diseases_and_Symptoms.csv` is intentionally kept out of GitHub because it exceeds GitHub's 100 MB limit.
- This project is for educational use and not a substitute for medical diagnosis.
