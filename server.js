import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const API_BASE = "https://api.retellai.com"; // Retell REST base

if (!RETELL_API_KEY) console.warn("WARNING: RETELL_API_KEY is not set");

app.use(express.json());

// CORS: allow all (we can restrict later)
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

// --- helper to read the agent's reply from completion payload ---
function pickReply(completion) {
  const msgs = completion?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const role = (msgs[i]?.role || "").toLowerCase();
    if ((role === "agent" || role === "assistant") && msgs[i]?.content) return msgs[i].content;
  }
  return "Thanks—tell me a bit more.";
}

// POST /start  -> create chat + send first user message, return reply + chat_id
app.post("/start", async (req, res) => {
  try {
    const { message, agentId, metadata } = req.body || {};
    if (!message || !agentId) return res.status(400).json({ ok: false, error: "Missing message or agentId" });

    // 1) Create chat
    const chatResp = await fetch(`${API_BASE}/create-chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ agent_id: agentId, metadata: metadata || {} })
    });
    if (!chatResp.ok) return res.status(502).json({ ok: false, error: await chatResp.text() });
    const { chat_id } = await chatResp.json();

    // 2) Send first message → get agent reply
    const compResp = await fetch(`${API_BASE}/create-chat-completion`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ chat_id, content: message })
    });
    if (!compResp.ok) return res.status(502).json({ ok: false, error: await compResp.text() });
    const completion = await compResp.json();

    res.json({ ok: true, chat_id, reply: pickReply(completion) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// POST /send  -> continue same chat_id, return next reply
app.post("/send", async (req, res) => {
  try {
    const { message, chat_id } = req.body || {};
    if (!message || !chat_id) return res.status(400).json({ ok: false, error: "Missing message or chat_id" });

    const compResp = await fetch(`${API_BASE}/create-chat-completion`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ chat_id, content: message })
    });
    if (!compResp.ok) return res.status(502).json({ ok: false, error: await compResp.text() });
    const completion = await compResp.json();

    res.json({ ok: true, chat_id, reply: pickReply(completion) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`retell proxy listening on :${PORT}`);
});
