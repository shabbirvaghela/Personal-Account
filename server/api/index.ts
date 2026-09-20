import type { IncomingMessage, ServerResponse } from "http";
import { app } from "../src/app";
import { initSchema } from "../src/db";

// Runs once per warm serverless container, not per request.
let schemaReady: Promise<void> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!schemaReady) schemaReady = initSchema();
  try {
    await schemaReady;
  } catch (err) {
    // Don't memoize a failed init — a transient DB outage would otherwise
    // wedge this warm container into failing every request forever.
    schemaReady = null;
    throw err;
  }
  app(req, res);
}
