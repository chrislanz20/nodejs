// server.js — CourtLaw Retell proxy with diagnostics
import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

// Your Retell secret stays ONLY in Railway env var (RETELL_API_KEY)
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const API_BASE = "https://api.retellai.com"; // Retell REST base

if (!RETELL_API_KEY) {
  console.warn("WARNING: RETELL_API_KEY is not set");
}

app.use(express.json());

// CORS: allow all for now (tighten later)
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));

// --- UTIL: proxy POST to Retell with good error detail ---
async function retellPost(path, payload) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  let json; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    console.error(`Retell ${path} failed`, { status: resp.status, text });
    return { ok: false, status: resp.status, error: text || `HTTP ${resp.status}` };
  }
  return { ok: true, status: resp.status, data: json };
}

// --- CHAT: start & send ---
app.post("/start", async (req, res) => {
  try {
    const { message, agentId, metadata } = req.body || {};
    if (!message || !agentId) return res.status(400).json({ ok: false, error: "Missing message or agentId" });

    // 1) create chat
    const created = await retellPost("/create-chat", { agent_id: agentId, metadata: metadata || {} });
    if (!created.ok) return res.status(502).json(created);
    const { chat_id } = created.data;

    // 2) send first message
    const completed = await retellPost("/create-chat-completion", { chat_id, content: message });
    if (!completed.ok) return res.status(502).json(completed);

    return res.json({ ok: true, chat_id, reply: pickReply(completed.data) });
  } catch (e) {
    console.error("Proxy /start error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { message, chat_id } = req.body || {};
    if (!message || !chat_id) return res.status(400).json({ ok: false, error: "Missing message or chat_id" });

    const completed = await retellPost("/create-chat-completion", { chat_id, content: message });
    if (!completed.ok) return res.status(502).json(completed);

    return res.json({ ok: true, chat_id, reply: pickReply(completed.data) });
  } catch (e) {
    console.error("Proxy /send error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- helper: pick latest agent/assistant reply ---
function pickReply(completion) {
  const msgs = completion?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const role = (msgs[i]?.role || "").toLowerCase();
    if ((role === "agent" || role === "assistant") && msgs[i]?.content) return msgs[i].content;
  }
  return "Thanks—tell me a bit more.";
}

// ========== DIAGNOSTICS (copy-paste in browser) ==========
// 1) Verify your API key can see the agent
// GET /diag/agent?id=agent_XXXXXXXX
app.get("/diag/agent", async (req, res) => {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Provide ?id=<agent_id>" });
    const url = `${API_BASE}/get-agent/${encodeURIComponent(id)}`;
    const r = await fetch(url, { headers: { "Authorization": `Bearer ${RETELL_API_KEY}` } });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 2) List agents visible to your API key
// GET /diag/list-agents
app.get("/diag/list-agents", async (_req, res) => {
  try {
    const url = `${API_BASE}/list-agents`;
    const r = await fetch(url, { headers: { "Authorization": `Bearer ${RETELL_API_KEY}` } });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, () => console.log(`retell proxy listening on :${PORT}`));
