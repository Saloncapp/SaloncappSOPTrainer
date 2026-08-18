import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDb } from "./db";
import trainingsRouter from "./routes/trainings";
import assessmentRouter from "./routes/assessment";
import agentRouter from "./routes/agent";

async function main() {
  await connectDb();
  console.log("Connected to MongoDB");

  const app = express();
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(","),
    }),
  );
  app.use(express.json({ limit: "15mb" }));

  app.get("/health", (_req, res) => {
    res.json({ success: true, service: "saloncapp-sop-trainer", status: "ok" });
  });

  app.use("/api/trainings", trainingsRouter);
  app.use("/api/trainings/:id/agent", agentRouter);
  app.use("/api/trainings/:id", assessmentRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("[unhandled]", err);
      res.status(500).json({ success: false, error: err.message || "Server error" });
    },
  );

  app.listen(config.port, () => {
    console.log(`Saloncapp SOP Trainer listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start SOP Trainer:", err);
  process.exit(1);
});
