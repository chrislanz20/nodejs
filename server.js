require('dotenv').config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const Retell = require('retell-sdk').default;

const app = express();
app.use(express.json());

// Allow your site to call this API (we can restrict origins later)
app.use(cors());

// Serve the marketing site
const publicDir = path.join(__dirname, "public");

// Define routes BEFORE static middleware to override index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// Now serve static files (styles.css, etc.)
app.use(express.static(publicDir));

// --- ENV VARS ---
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

if (!RETELL_API_KEY) {
  console.error("ERROR: RETELL_API_KEY environment variable is not set!");
  console.error("Please set it in your environment or Vercel project settings.");
}

// Initialize Retell SDK client
const retellClient = new Retell({
  apiKey: RETELL_API_KEY,
});

// Health check (handy for Railway)
app.get("/healthz", (_req, res) => res.send("ok"));

// ============ DASHBOARD API ROUTES ============

// Get all agents
app.get("/api/agents", async (_req, res) => {
  try {
    const data = await retellClient.agent.list();
    res.json(data);
  } catch (error) {
    console.error("Error fetching agents:", error.message);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

// Get specific agent details
app.get("/api/agents/:agentId", async (req, res) => {
  try {
    const data = await retellClient.agent.retrieve(req.params.agentId);
    res.json(data);
  } catch (error) {
    console.error("Error fetching agent details:", error.message);
    res.status(500).json({ error: "Failed to fetch agent details" });
  }
});

// Get all calls (with optional filtering and pagination)
app.get("/api/calls", async (req, res) => {
  try {
    const { agent_id, get_all = 'true' } = req.query;

    if (get_all === 'true') {
      // Fetch ALL calls with pagination using SDK
      let allCalls = [];
      let paginationKey = undefined;
      const pageSize = 1000;
      let pageCount = 0;

      do {
        const params = { limit: pageSize };
        if (agent_id) params.filter_criteria = { agent_id: [agent_id] };  // agent_id must be an array
        if (paginationKey) params.pagination_key = paginationKey;

        const data = await retellClient.call.list(params);

        // Handle both array responses and object responses
        const calls = Array.isArray(data) ? data : (data.calls || []);
        const nextPaginationKey = Array.isArray(data) ? null : (data.pagination_key || null);

        pageCount++;

        console.log(`Fetched page ${pageCount}: ${calls.length} calls, has pagination_key: ${!!nextPaginationKey}`);

        if (calls.length > 0) {
          allCalls = allCalls.concat(calls);
        }

        // Check if there's more data
        paginationKey = nextPaginationKey;
      } while (paginationKey && allCalls.length < 10000); // Safety limit

      console.log(`Total calls fetched: ${allCalls.length} across ${pageCount} pages`);
      res.json({ calls: allCalls, total: allCalls.length });
    } else {
      // Single page request
      const { limit = 100 } = req.query;
      const params = { limit: parseInt(limit) };
      if (agent_id) params.filter_criteria = { agent_id: [agent_id] };  // agent_id must be an array

      const data = await retellClient.call.list(params);
      res.json(data);
    }
  } catch (error) {
    console.error("Error fetching calls:", error.message);
    res.status(500).json({ error: "Failed to fetch calls" });
  }
});

// Get specific call details
app.get("/api/calls/:callId", async (req, res) => {
  try {
    const data = await retellClient.call.retrieve(req.params.callId);
    res.json(data);
  } catch (error) {
    console.error("Error fetching call details:", error.message);
    res.status(500).json({ error: "Failed to fetch call details" });
  }
});

// Helper function to wait/sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry API calls with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 2000; // 2s, 4s, 8s
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${i + 1}...`);
        await sleep(waitTime);
      } else {
        throw error;
      }
    }
  }
}

// Test endpoint to see raw API response
app.get("/api/test-calls", async (req, res) => {
  try {
    console.log('Testing raw Retell API call...');

    const requestBody = { limit: 10 };

    const response = await axios.post('https://api.retellai.com/v2/list-calls', requestBody, {
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      responseType: typeof response.data,
      responseKeys: Object.keys(response.data || {}),
      fullResponse: response.data,
      callsCount: (response.data.calls || []).length
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Get aggregated agent summary - fetches ALL data once and aggregates by agent name
app.get("/api/agent-summary", async (req, res) => {
  try {
    console.log('Fetching agent summary...');

    // Fetch all agents
    const agentsData = await retryWithBackoff(() => retellClient.agent.list());
    const allAgents = agentsData.agents || agentsData || [];
    console.log(`Fetched ${allAgents.length} total agent versions`);

    // Add a small delay after fetching agents
    await sleep(500);

    // Fetch ALL calls with pagination - using direct API call instead of SDK
    let allCalls = [];
    let paginationKey = undefined;
    const pageSize = 1000;
    let pageCount = 0;

    do {
      // Add delay between pagination requests to avoid rate limiting (1.5 seconds)
      if (pageCount > 0) {
        console.log('Waiting 1.5s before next page to avoid rate limiting...');
        await sleep(1500);
      }

      // Call API directly to see raw response
      const requestBody = {
        limit: pageSize
      };
      if (paginationKey) {
        requestBody.pagination_key = paginationKey;
      }

      console.log('Calling Retell API with:', JSON.stringify(requestBody));

      const response = await retryWithBackoff(async () => {
        const result = await axios.post('https://api.retellai.com/v2/list-calls', requestBody, {
          headers: {
            'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        return result.data;
      });

      console.log('Raw API response status: success');
      console.log('Response type:', typeof response);
      console.log('Response is array?:', Array.isArray(response));
      console.log('Response keys:', Object.keys(response || {}));
      console.log('Response sample:', JSON.stringify(response).substring(0, 1000));

      // Handle different response structures from Retell API
      let calls = [];
      let nextPaginationKey = null;

      if (Array.isArray(response)) {
        // Response is directly an array of calls (some API endpoints return this)
        console.log('Response is array - using directly');
        calls = response;
        // No pagination key available in this format
        nextPaginationKey = null;
      } else if (response && typeof response === 'object') {
        // Response is an object with calls property
        calls = response.calls || response.data?.calls || [];
        nextPaginationKey = response.pagination_key || response.data?.pagination_key || null;
      }

      pageCount++;
      console.log(`Fetched page ${pageCount}: ${calls.length} calls`);
      console.log('Sample call structure:', calls[0] ? JSON.stringify(calls[0]).substring(0, 200) : 'No calls');

      if (calls.length > 0) {
        allCalls = allCalls.concat(calls);
      }

      paginationKey = nextPaginationKey;
      console.log('Next pagination key:', paginationKey ? 'exists' : 'none');
    } while (paginationKey && allCalls.length < 50000); // Increased safety limit

    console.log(`Total calls fetched: ${allCalls.length}`);

    // Group agents by name
    const agentsByName = new Map();
    allAgents.forEach(agent => {
      const name = agent.agent_name || 'Unnamed Agent';
      if (!agentsByName.has(name)) {
        agentsByName.set(name, {
          name: name,
          agent_ids: [],
          representative: agent
        });
      }
      agentsByName.get(name).agent_ids.push(agent.agent_id);
    });

    // Calculate stats for each unique agent name
    const agentSummaries = Array.from(agentsByName.values()).map(agentGroup => {
      // Find all calls for this agent (across all versions)
      const agentCalls = allCalls.filter(call =>
        agentGroup.agent_ids.includes(call.agent_id)
      );

      // Calculate stats
      const totalCalls = agentCalls.length;
      const totalDuration = agentCalls.reduce((sum, call) => {
        return sum + (call.end_timestamp && call.start_timestamp
          ? (call.end_timestamp - call.start_timestamp) / 1000 / 60
          : 0);
      }, 0);
      const totalCost = agentCalls.reduce((sum, call) => {
        // Retell API returns costs in cents, convert to dollars
        return sum + ((call.call_cost?.combined_cost || 0) / 100);
      }, 0);

      return {
        agent_name: agentGroup.name,
        agent_ids: agentGroup.agent_ids,
        version_count: agentGroup.agent_ids.length,
        representative: agentGroup.representative,
        total_calls: totalCalls,
        total_duration_minutes: Math.round(totalDuration * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        average_cost_per_call: totalCalls > 0 ? Math.round((totalCost / totalCalls) * 100) / 100 : 0,
        calls: agentCalls.map(call => ({
          ...call,
          duration_minutes: call.end_timestamp && call.start_timestamp
            ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
            : 0,
          cost: (call.call_cost?.combined_cost || 0) / 100  // Convert cents to dollars
        }))
      };
    });

    res.json({
      agents: agentSummaries,
      all_calls: allCalls.map(call => ({
        ...call,
        duration_minutes: call.end_timestamp && call.start_timestamp
          ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
          : 0,
        cost: (call.call_cost?.combined_cost || 0) / 100  // Convert cents to dollars
      })),
      total_calls: allCalls.length
    });
  } catch (error) {
    console.error("Error in agent-summary endpoint:", error.message);
    console.error("Error details:", error);
    res.status(500).json({ error: "Failed to fetch agent summary", details: error.message });
  }
});

// Get analytics summary (custom endpoint that aggregates data)
app.get("/api/analytics/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { start_date, end_date } = req.query;

    // Fetch agent details using SDK
    const agent = await retellClient.agent.retrieve(agentId);

    // Fetch ALL calls for this agent with pagination using SDK
    let calls = [];
    let paginationKey = undefined;
    const pageSize = 1000;

    do {
      const params = {
        limit: pageSize,
        filter_criteria: { agent_id: [agentId] }  // agent_id must be an array
      };
      if (paginationKey) params.pagination_key = paginationKey;

      const data = await retellClient.call.list(params);

      // Handle both array responses and object responses
      const pageCalls = Array.isArray(data) ? data : (data.calls || []);
      const nextPaginationKey = Array.isArray(data) ? null : (data.pagination_key || null);

      if (pageCalls.length > 0) {
        calls = calls.concat(pageCalls);
      }

      paginationKey = nextPaginationKey;
    } while (paginationKey && calls.length < 10000); // Safety limit

    // Calculate statistics using ACTUAL cost data from Retell
    const totalCalls = calls.length;
    const totalDuration = calls.reduce((sum, call) => {
      const duration = call.end_timestamp && call.start_timestamp
        ? (call.end_timestamp - call.start_timestamp) / 1000 / 60 // convert to minutes
        : 0;
      return sum + duration;
    }, 0);

    // Use actual cost from Retell API (returned in cents, convert to dollars)
    const totalCost = calls.reduce((sum, call) => {
      return sum + ((call.call_cost?.combined_cost || 0) / 100);
    }, 0);

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
        cost: (call.call_cost?.combined_cost || 0) / 100,  // Convert cents to dollars
      })),
    });
  } catch (error) {
    console.error("Error in analytics endpoint:", error.message);
    console.error("Error details:", error);
    res.status(500).json({ error: "Failed to fetch analytics", details: error.message });
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
