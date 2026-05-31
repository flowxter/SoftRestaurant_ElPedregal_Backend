import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler, notFound } from "./middlewares/errorHandler";
import authRoutes from "./routes/auth.routes";

const app = express();

const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/auth", authRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
