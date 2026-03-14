const ML_SERVICE_HOST = process.env.ML_SERVICE_HOST || "127.0.0.1";
const ML_SERVICE_PORT = process.env.ML_SERVICE_PORT || "8000";
const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL || `http://${ML_SERVICE_HOST}:${ML_SERVICE_PORT}`;

async function callMlService(path, options = {}) {
  const response = await fetch(`${ML_SERVICE_URL}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || "ML service request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

export function fetchMetadata() {
  return callMlService("/metadata");
}

export function fetchPrediction(payload) {
  return callMlService("/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
