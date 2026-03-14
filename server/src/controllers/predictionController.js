import Prediction from "../models/Prediction.js";
import { isDatabaseReady } from "../config/db.js";
import { fetchMetadata, fetchPrediction } from "../services/mlService.js";

export async function getMetadata(_req, res, next) {
  try {
    const metadata = await fetchMetadata();
    res.json(metadata);
  } catch (error) {
    next(error);
  }
}

export async function predictDisease(req, res, next) {
  try {
    const symptoms = Array.isArray(req.body?.symptoms) ? req.body.symptoms : [];

    const predictionResult = await fetchPrediction({
      symptoms,
      featureValues: req.body?.featureValues || {},
    });

    if (isDatabaseReady()) {
      await Prediction.create({
        selectedSymptoms: predictionResult.selectedSymptoms,
        predictedDisease: predictionResult.prediction.disease,
        confidence: predictionResult.prediction.confidence,
        specialist: predictionResult.prediction.specialist,
        precautions: predictionResult.prediction.precautions,
        topPredictions: predictionResult.topPredictions.map((item) => ({
          disease: item.disease,
          confidence: item.confidence,
          specialist: item.specialist,
        })),
      });
    }

    res.json(predictionResult);
  } catch (error) {
    next(error);
  }
}

export async function getPredictionHistory(_req, res, next) {
  try {
    if (!isDatabaseReady()) {
      res.json([]);
      return;
    }

    const history = await Prediction.find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    res.json(history);
  } catch (error) {
    next(error);
  }
}
