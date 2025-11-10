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
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// --- ENV VARS (we'll set these in Railway) ---
const RETELL_API_KEY = process.env.RETELL_API_KEY || "key_2b025c76697990df02799b672713";
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID; // your Chat Agent ID

const RETELL_API_BASE = "https://api.retellai.com";

// Helper function for Retell API calls
async function retellAPI(endpoint, method = "GET", body = null) {
  try {
    const config = {
      method,
      url: `${RETELL_API_BASE}${endpoint}`,
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
    if (body) config.data = body;
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Retell API Error (${endpoint}):`, error?.response?.data || error.message);
    throw error;
  }
}

// Health check (handy for Railway)
app.get("/healthz", (_req, res) => res.send("ok"));

// ============ DASHBOARD API ROUTES ============

// Get all agents
app.get("/api/agents", async (_req, res) => {
  try {
    const data = await retellAPI("/list-agents");
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

// Get specific agent details
app.get("/api/agents/:agentId", async (req, res) => {
  try {
    const data = await retellAPI(`/get-agent/${req.params.agentId}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agent details" });
  }
});

// Get all calls (with optional filtering)
app.get("/api/calls", async (req, res) => {
  try {
    const { agent_id, limit = 100, filter_criteria } = req.query;
    let endpoint = `/list-calls?limit=${limit}`;
    if (agent_id) endpoint += `&filter_criteria=${JSON.stringify({ agent_id })}`;
    const data = await retellAPI(endpoint);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch calls" });
  }
});

// Get specific call details
app.get("/api/calls/:callId", async (req, res) => {
  try {
    const data = await retellAPI(`/get-call/${req.params.callId}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch call details" });
  }
});

// Get analytics summary (custom endpoint that aggregates data)
app.get("/api/analytics/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { start_date, end_date } = req.query;

    // Fetch agent details and calls
    const agent = await retellAPI(`/get-agent/${agentId}`);
    const callsData = await retellAPI(`/list-calls?filter_criteria=${JSON.stringify({ agent_id: agentId })}`);
    const calls = callsData.calls || [];

    // Calculate statistics
    const totalCalls = calls.length;
    const totalDuration = calls.reduce((sum, call) => {
      const duration = call.end_timestamp && call.start_timestamp
        ? (call.end_timestamp - call.start_timestamp) / 1000 / 60 // convert to minutes
        : 0;
      return sum + duration;
    }, 0);

    // Calculate cost based on agent configuration
    const calculateCallCost = (call, agentConfig) => {
      if (!call.end_timestamp || !call.start_timestamp) return 0;
      const minutes = (call.end_timestamp - call.start_timestamp) / 1000 / 60;

      // Base costs (these are estimates, adjust based on actual config)
      let voiceCost = 0.07; // ElevenLabs default
      let llmCost = 0.06;   // Claude 3.5 default
      let telephonyCost = 0.01;

      // Adjust based on agent configuration
      if (agentConfig.voice_id?.includes('openai')) voiceCost = 0.08;
      if (agentConfig.llm_id?.includes('gpt-4')) llmCost = 0.06;
      if (agentConfig.llm_id?.includes('gpt-3')) llmCost = 0.02;

      return minutes * (voiceCost + llmCost + telephonyCost);
    };

    const totalCost = calls.reduce((sum, call) => sum + calculateCallCost(call, agent), 0);
    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const avgCost = totalCalls > 0 ? totalCost / totalCalls : 0;

    res.json({
      agent_id: agentId,
      agent_name: agent.agent_name || "Unnamed Agent",
      total_calls: totalCalls,
      total_duration_minutes: Math.round(totalDuration * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      average_duration_minutes: Math.round(avgDuration * 100) / 100,
      average_cost_per_call: Math.round(avgCost * 100) / 100,
      calls: calls.map(call => ({
        ...call,
        duration_minutes: call.end_timestamp && call.start_timestamp
          ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
          : 0,
        cost: Math.round(calculateCallCost(call, agent) * 100) / 100,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

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
