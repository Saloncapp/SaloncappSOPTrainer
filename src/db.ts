import mongoose from "mongoose";
import { config } from "./config";

function databaseNameFromUri(uri: string): string {
  try {
    const withoutQuery = uri.split("?")[0] || uri;
    const parts = withoutQuery.split("/");
    const name = parts[parts.length - 1] || "";
    return name.trim();
  } catch {
    return "";
  }
}

/**
 * Training module MUST use its own MongoDB database.
 * Never point this service at the SaloncappRepo business DB (e.g. "preprod").
 */
const FORBIDDEN_SHARED_DB_NAMES = new Set([
  "preprod",
  "production",
  "prod",
  "salon-app",
  "saloncapp",
]);

export async function connectDb(): Promise<typeof mongoose> {
  const dbName = databaseNameFromUri(config.mongodbUri);
  if (!dbName) {
    throw new Error(
      "MONGODB_URI must include a database name, e.g. ...mongodb.net/saloncapp_sop_trainer",
    );
  }
  if (FORBIDDEN_SHARED_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to connect to shared app database "${dbName}". ` +
        `Use a dedicated training database such as "saloncapp_sop_trainer".`,
    );
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  console.log(`Training MongoDB database: ${dbName}`);

  try {
    const progressCol = mongoose.connection.collection("staff_training_progress");
    await progressCol.dropIndex("staffId_1_tenantStoreId_1_trainingId_1");
  } catch {
    // legacy unique index may not exist
  }
  try {
    const attemptsCol = mongoose.connection.collection("assessment_attempts");
    await attemptsCol.dropIndex("staffId_1_tenantStoreId_1_trainingId_1_attemptNumber_-1");
  } catch {
    // legacy unique index may not exist
  }

  return mongoose;
}
