import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuid } from "uuid";
import { db } from "./db";
import { JWT_SECRET } from "./middleware/auth";

const router = Router();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "30d") as jwt.SignOptions["expiresIn"];
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password are required" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "email_already_registered" });

  const id = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, email, passwordHash, Date.now());

  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.status(201).json({ token, user: { id, name, email } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | { id: string; name: string; email: string; password_hash: string | null }
    | undefined;
  if (!user || !user.password_hash) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// POST /auth/google  { credential: <Google ID token from Google Identity Services> }
router.post("/google", async (req, res) => {
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

  let user = db.prepare("SELECT * FROM users WHERE google_sub = ? OR email = ?").get(sub, email) as
    | { id: string; name: string; email: string }
    | undefined;
  let isNewUser = false;

  if (!user) {
    const id = uuid();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, google_sub, created_at) VALUES (?, ?, ?, NULL, ?, ?)"
    ).run(id, name || email, email, sub, Date.now());
    user = { id, name: name || email, email };
    isNewUser = true;
  } else {
    db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").run(sub, user.id);
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email }, isNewUser });
});

export default router;
