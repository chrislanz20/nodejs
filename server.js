// server.js — CourtLaw Retell proxy (diagnostic-friendly)
import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

// Keep your secret in Railway → Variables (RETELL_API_KEY). Do NOT hardcode.
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const API_BASE = "https://api.retellai.com"; // Retell REST base

if (!RETELL_API_KEY) {
  console.warn("WARNING: RETELL_API_KEY is not set");
}

app.use(express.json());

// CORS: allow all for now (you can tighten later)
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));

// Helper to extract the agent's latest reply
function pickReply(completion) {
  const msgs = completion?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const role = (msgs[i]?.role || "").toLowerCase();
    if ((role === "agent" || role === "assistant") && msgs[i]?.content) return msgs[i].content;
  }
  return "Thanks—tell me a bit more.";
}

// Helper to proxy POST to Retell with good error messages
async function retell(path, payload) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!resp.ok) {
    // Log full context server-side for debugging
    console.error(`Retell ${path} failed`, { status: resp.status, text });
    return { ok: false, status: resp.status, error: text || `HTTP ${resp.status}` };
  }
  return { ok: true, status: resp.status, data: json };
}

// POST /start  -> create chat + send first user message, return reply + chat_id
app.post("/start", async (req, res) => {
  try {
    const { message, agentId, metadata } = req.body || {};
    if (!message || !agentId) {
      return res.status(400).json({ ok: false, error: "Missing message or agentId" });
    }

    // 1) Create chat
    const created = await retell("/create-chat", { agent_id: agentId, metadata: metadata || {} });
    if (!created.ok) return res.status(502).json(created);
    const { chat_id } = created.data;

    // 2) Send first message → get agent reply
    const completed = await retell("/create-chat-completion", { chat_id, content: message });
    if (!completed.ok) return res.status(502).json(completed);

    return res.json({ ok: true, chat_id, reply: pickReply(completed.data) });
  } catch (e) {
    console.error("Proxy /start error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// POST /send  -> continue same chat_id, return next reply
app.post("/send", async (req, res) => {
  try {
    const { message, chat_id } = req.body || {};
    if (!message || !chat_id) {
      return res.status(400).json({ ok: false, error: "Missing message or chat_id" });
    }

    const completed = await retell("/create-chat-completion", { chat_id, content: message });
    if (!completed.ok) return res.status(502).json(completed);

    return res.json({ ok: true, chat_id, reply: pickReply(completed.data) });
  } catch (e) {
    console.error("Proxy /send error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`retell proxy listening on :${PORT}`);
});

