const ML_SERVICE_HOST = process.env.ML_SERVICE_HOST || "127.0.0.1";
const ML_SERVICE_PORT = process.env.ML_SERVICE_PORT || "8000";

function buildMlServiceCandidates() {
  const candidates = [];

  if (process.env.ML_SERVICE_URL) {
    candidates.push(process.env.ML_SERVICE_URL);
  }

  candidates.push(`http://${ML_SERVICE_HOST}:${ML_SERVICE_PORT}`);

  // Fallback for Render free-tier cold starts and public routing.
  if (!ML_SERVICE_HOST.includes(".")) {
    candidates.push(`https://${ML_SERVICE_HOST}.onrender.com`);
  }

  return [...new Set(candidates)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    throw new Error("Empty response from ML service");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("ML service returned a non-JSON response");
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryRequest(baseUrl, path, options = {}, timeoutMs = 20000) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, options, timeoutMs);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const error = new Error(data.error || "ML service request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function callMlService(path, options = {}, requestConfig = {}) {
  const candidates = buildMlServiceCandidates();
  const attempts = requestConfig.attempts || 3;
  const timeoutMs = requestConfig.timeoutMs || 20000;
  const baseDelayMs = requestConfig.baseDelayMs || 2000;
  let lastError = null;

  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await tryRequest(candidate, path, options, timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(baseDelayMs * attempt);
        }
      }
    }
  }

  const error = new Error(lastError?.message || "ML service request failed");
  error.status = lastError?.status || 502;
  throw error;
}

export function fetchMetadata() {
  return callMlService("/metadata");
}

export async function fetchPrediction(payload) {
  // Wake the service before requesting a heavier prediction call.
  await callMlService("/health", {}, { attempts: 2, timeoutMs: 15000, baseDelayMs: 1000 });

  return callMlService(
    "/predict",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      attempts: 5,
      timeoutMs: 120000,
      baseDelayMs: 4000,
    },
  );
}
