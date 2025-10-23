const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(express.json());

// Allow your site to call this API (we can restrict origins later)
app.use(cors());

// Serve the marketing site
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// --- ENV VARS (we'll set these in Railway) ---
const RETELL_API_KEY = process.env.RETELL_API_KEY;   // secret key from Retell dashboard
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID; // your Chat Agent ID

// Health check (handy for Railway)
app.get("/healthz", (_req, res) => res.send("ok"));

// POST /greet -> returns { chat_id, message }
app.post("/greet", async (_req, res) => {
  try {
    // 1) create a chat session
    const chatResp = await axios.post(
      "https://api.retellai.com/create-chat",
      { agent_id: RETELL_AGENT_ID },
      { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );
    const chat_id = chatResp.data.chat_id;

    // 2) ask agent to produce a short EN/ES greeting (text only)
    const seed = "Greet the visitor briefly in English and Spanish, then ask how you can help. Keep it one sentence.";
    const compResp = await axios.post(
      "https://api.retellai.com/create-chat-completion",
      { chat_id, content: seed },
      { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );

    const messages = compResp.data?.messages || [];
    const agentMsg = messages.find(m => m.role === "agent")?.content || "Hello! How can I help?";

    res.json({ chat_id, message: agentMsg });
  } catch (err) {
    console.error("Greeting error:", err?.response?.data || err.message);
    res.status(500).json({ error: "failed" });
  }
});

// Railway will set PORT for us
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on ${PORT}`));
