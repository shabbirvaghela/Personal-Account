import express from "express";
import cors from "cors";
import authRouter from "./auth";
import syncRouter from "./sync";
import reportsRouter from "./reports";

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/auth", authRouter);
app.use("/sync", syncRouter);
app.use("/reports", reportsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});
