import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuid } from "uuid";
import { pool } from "./db";
import { JWT_SECRET } from "./middleware/auth";
import { ah } from "./asyncHandler";

const router = Router();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "30d") as jwt.SignOptions["expiresIn"];
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

router.post("/register", ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password are required" });
  }
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) return res.status(409).json({ error: "email_already_registered" });

  const id = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
    [id, name, email, passwordHash, Date.now()]
  );

  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.status(201).json({ token, user: { id, name, email } });
}));

router.post("/login", ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const result = await pool.query<{ id: string; name: string; email: string; password_hash: string | null }>(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.password_hash) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
}));

// POST /auth/google  { credential: <Google ID token from Google Identity Services> }
router.post("/google", ah(async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: "google_sign_in_not_configured" });
  }
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: "credential_required" });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "invalid_google_credential" });
  }
  if (!payload?.email || !payload.sub) {
    return res.status(401).json({ error: "invalid_google_credential" });
  }

  const { sub, email, name } = payload;

  const existing = await pool.query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE google_sub = $1 OR email = $2",
    [sub, email]
  );
  let user = existing.rows[0];
  let isNewUser = false;

  if (!user) {
    const id = uuid();
    await pool.query(
      "INSERT INTO users (id, name, email, password_hash, google_sub, created_at) VALUES ($1, $2, $3, NULL, $4, $5)",
      [id, name || email, email, sub, Date.now()]
    );
    user = { id, name: name || email, email };
    isNewUser = true;
  } else {
    await pool.query("UPDATE users SET google_sub = $1 WHERE id = $2", [sub, user.id]);
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email }, isNewUser });
}));

export default router;
