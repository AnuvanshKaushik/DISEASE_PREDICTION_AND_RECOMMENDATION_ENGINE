import mongoose from "mongoose";

let databaseReady = false;

export async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn("MONGODB_URI is not set. Prediction history will run without persistence.");
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || "disease_prediction_engine",
    });
    databaseReady = true;
    console.log("MongoDB connected");
  } catch (error) {
    console.warn(`MongoDB connection failed: ${error.message}`);
  }
}

export function isDatabaseReady() {
  return databaseReady;
}
