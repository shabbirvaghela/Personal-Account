import type { IncomingMessage, ServerResponse } from "http";
import { app } from "../src/app";
import { initSchema } from "../src/db";

// Runs once per warm serverless container, not per request.
let schemaReady: Promise<void> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!schemaReady) schemaReady = initSchema();
  await schemaReady;
  app(req, res);
}
