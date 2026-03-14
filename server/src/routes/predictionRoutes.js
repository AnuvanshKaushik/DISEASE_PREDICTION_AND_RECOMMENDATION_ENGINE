import { Router } from "express";

import {
  getMetadata,
  getPredictionHistory,
  predictDisease,
} from "../controllers/predictionController.js";

const router = Router();

router.get("/metadata", getMetadata);
router.get("/history", getPredictionHistory);
router.post("/predict", predictDisease);

export default router;
