import mongoose from "mongoose";

const predictionSchema = new mongoose.Schema(
  {
    selectedSymptoms: {
      type: [String],
      default: [],
    },
    predictedDisease: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      required: true,
    },
    specialist: {
      type: String,
      default: "Primary care physician",
    },
    precautions: {
      type: String,
      default: "",
    },
    topPredictions: {
      type: [
        {
          disease: String,
          confidence: Number,
          specialist: String,
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

const Prediction = mongoose.models.Prediction || mongoose.model("Prediction", predictionSchema);

export default Prediction;
