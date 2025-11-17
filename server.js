require('dotenv').config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs").promises;
const Retell = require('retell-sdk').default;
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '50mb' }));  // Allow large payloads for category migration

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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!RETELL_API_KEY) {
  console.error("ERROR: RETELL_API_KEY environment variable is not set!");
  console.error("Please set it in your environment or Vercel project settings.");
}

if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY environment variable is not set!");
  console.error("Please set it in your environment or Vercel project settings.");
} else {
  console.log(`ANTHROPIC_API_KEY is set (starts with: ${ANTHROPIC_API_KEY.substring(0, 7)}...)`);
}

// Initialize Retell SDK client
const retellClient = new Retell({
  apiKey: RETELL_API_KEY,
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// Initialize Postgres connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection and create table if needed
async function initializeDatabase() {
  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to Postgres database');

    // Create categories table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS call_categories (
        call_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        reasoning TEXT,
        manual BOOLEAN DEFAULT FALSE,
        auto BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Categories table initialized');
    client.release();
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    console.error('Falling back to localStorage-only mode');
  }
}

// Initialize database on startup
initializeDatabase();

// Categories file path (keeping for backwards compatibility/fallback)
const CATEGORIES_FILE = path.join(__dirname, 'categories.json');

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
      const pageSize = 50;  // Retell API limit is 50 calls per page
      let pageCount = 0;

      do {
        const params = { limit: pageSize };
        if (agent_id) params.filter_criteria = { agent_id: [agent_id] };  // agent_id must be an array
        if (paginationKey) params.pagination_key = paginationKey;

        const data = await retellClient.call.list(params);

        // Handle both array responses and object responses
        let calls, nextPaginationKey;
        if (Array.isArray(data)) {
          calls = data;
          nextPaginationKey = null;  // Arrays don't have pagination keys
          console.log('SDK returned array format');
        } else {
          calls = data.calls || [];
          nextPaginationKey = data.pagination_key || null;
        }

        pageCount++;

        console.log(`Fetched page ${pageCount}: ${calls.length} calls (requested ${pageSize}), has pagination_key: ${!!nextPaginationKey}`);

        if (calls.length > 0) {
          allCalls = allCalls.concat(calls);
        }

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

    // Fetch ALL calls using SDK with pagination
    let allCalls = [];
    let paginationKey = undefined;
    const pageSize = 1000;  // Request max per page
    let pageCount = 0;

    console.log('🔍 Fetching ALL calls with SDK pagination...\n');

    // Keep fetching until we run out of data
    while (pageCount < 50) { // Safety limit: 50 pages = 50k calls max
      if (pageCount > 0) {
        await sleep(500); // Small delay to avoid rate limits
      }

      console.log(`📄 Page ${pageCount + 1}...`);

      try {
        const params = { limit: pageSize };
        if (paginationKey) {
          params.pagination_key = paginationKey;
        }

        const data = await retryWithBackoff(() => retellClient.call.list(params));

        // SDK returns array directly
        const calls = Array.isArray(data) ? data : (data.calls || []);

        console.log(`   Got ${calls.length} calls`);

        pageCount++;

        if (calls.length > 0) {
          allCalls = allCalls.concat(calls);
          // Use last call ID as pagination key for next request
          const lastCall = calls[calls.length - 1];
          paginationKey = lastCall.call_id;
        } else {
          // No calls returned - we're done
          console.log(`✓ Finished: ${allCalls.length} total calls (got 0 calls on page ${pageCount})`);
          break;
        }
      } catch (error) {
        console.error(`Error fetching page ${pageCount + 1}:`, error.message);
        console.error('Error details:', error);
        break;
      }
    }

    console.log(`\n📈 FINAL TOTALS:`);
    console.log(`Total calls fetched: ${allCalls.length}`);
    console.log(`Total pages fetched: ${pageCount}`);
    console.log(`Average calls per page: ${Math.round(allCalls.length / pageCount)}`);

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

    console.log(`Grouped into ${agentsByName.size} unique agent names from ${allAgents.length} total versions`);

    // DEBUG: Check for the specific agent ID that's causing issues
    const targetAgentId = 'agent_8e50b96f7e7bb7ce7479219fcc';
    const agentsWithTargetId = allAgents.filter(a => a.agent_id === targetAgentId);
    console.log(`\n🔍 Found ${agentsWithTargetId.length} agent(s) with ID ${targetAgentId}:`);
    agentsWithTargetId.forEach((agent, idx) => {
      console.log(`  ${idx + 1}. Name: "${agent.agent_name}" | Last modified: ${agent.last_modification_timestamp}`);
    });

    // Create a map from agent_id to agent_name for easy lookup
    // Use the MOST RECENTLY MODIFIED agent if there are duplicates
    const agentIdToName = new Map();
    allAgents
      .sort((a, b) => (b.last_modification_timestamp || 0) - (a.last_modification_timestamp || 0))
      .forEach(agent => {
        if (!agentIdToName.has(agent.agent_id)) {
          agentIdToName.set(agent.agent_id, agent.agent_name || 'Unnamed Agent');
        }
      });

    // DEBUG: Log agent names to help identify which agents are being used
    console.log('\n🔍 Agent ID to Name mapping (using most recent):');
    const recentCalls = allCalls.slice(0, 5).sort((a, b) => (b.start_timestamp || 0) - (a.start_timestamp || 0));
    recentCalls.forEach((call, idx) => {
      const agentName = agentIdToName.get(call.agent_id) || 'Unknown';
      console.log(`  Call ${idx + 1}: Agent="${agentName}" (ID: ${call.agent_id?.slice(0, 15)}...)`);
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
        agent_name: agentIdToName.get(call.agent_id) || 'Unknown Agent',
        duration_minutes: call.end_timestamp && call.start_timestamp
          ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
          : 0,
        cost: (call.call_cost?.combined_cost || 0) / 100  // Convert cents to dollars
      })),
      total_calls: allCalls.length,
      pages_fetched: pageCount
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
    const pageSize = 50;  // Retell API limit is 50 calls per page

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

// ============ CATEGORIZATION API ROUTES ============

// Helper: Read categories from file
// Helper: Read all categories from Postgres database
async function readCategories() {
  try {
    const result = await pool.query('SELECT call_id, category, reasoning, manual, auto FROM call_categories');

    // Convert rows to object format { call_id: { category, reasoning, manual, auto } }
    const categories = {};
    result.rows.forEach(row => {
      categories[row.call_id] = {
        category: row.category,
        reasoning: row.reasoning,
        manual: row.manual,
        auto: row.auto
      };
    });

    return categories;
  } catch (error) {
    console.error('Error reading categories from database:', error);
    return {};
  }
}

// Helper: Write a single category to Postgres database
async function writeCategory(callId, categoryData) {
  try {
    const { category, reasoning, manual, auto } = categoryData;

    await pool.query(`
      INSERT INTO call_categories (call_id, category, reasoning, manual, auto, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (call_id)
      DO UPDATE SET
        category = EXCLUDED.category,
        reasoning = EXCLUDED.reasoning,
        manual = EXCLUDED.manual,
        auto = EXCLUDED.auto,
        updated_at = NOW()
    `, [callId, category, reasoning || null, manual || false, auto || false]);

    return true;
  } catch (error) {
    console.error('Error writing category to database:', error);
    return false;
  }
}

// Helper: Write multiple categories to Postgres database (batch)
async function writeCategories(categories) {
  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const [callId, categoryData] of Object.entries(categories)) {
        // Handle both old format (string) and new format (object)
        const category = typeof categoryData === 'string' ? categoryData : categoryData.category;
        const reasoning = typeof categoryData === 'object' ? categoryData.reasoning : null;
        const manual = typeof categoryData === 'object' ? categoryData.manual : false;
        const auto = typeof categoryData === 'object' ? categoryData.auto : false;

        await client.query(`
          INSERT INTO call_categories (call_id, category, reasoning, manual, auto, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (call_id)
          DO UPDATE SET
            category = EXCLUDED.category,
            reasoning = EXCLUDED.reasoning,
            manual = EXCLUDED.manual,
            auto = EXCLUDED.auto,
            updated_at = NOW()
        `, [callId, category, reasoning, manual, auto]);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error writing categories to database:', error);
    return false;
  }
}

// Helper: Categorize a single transcript using Claude
async function categorizeTranscript(transcript) {
  if (!transcript || transcript.length === 0) {
    return { category: 'Other', reasoning: 'No transcript available' };
  }

  // Format transcript for Claude
  let transcriptText = '';
  if (Array.isArray(transcript)) {
    transcriptText = transcript.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  } else if (typeof transcript === 'string') {
    transcriptText = transcript;
  } else {
    return { category: 'Other', reasoning: 'Invalid transcript format' };
  }

  const prompt = `You are analyzing a phone call transcript for a personal injury law firm's AI receptionist.

INSTRUCTIONS:
1. Read the ENTIRE transcript carefully from start to finish
2. Identify the key purpose and context of the call
3. Look for specific keywords, phrases, and evidence that indicate the caller's relationship with the firm
4. Categorize with HIGH ACCURACY - this is critical for business operations

Categorize this call into ONE of these categories. Pay CLOSE ATTENTION to distinguish between New Leads and Existing Clients:

**New Lead** - ONLY if the caller is inquiring about legal services for the FIRST TIME. Look for:
  • Asking IF the firm can help them ("Can you help me with...", "Do you handle...")
  • Describing an accident/injury that hasn't been discussed with this firm before
  • No mention of existing representation or case
  • Asking about the firm's services, fees, or process
  • Phrases like: "I was in an accident", "I need a lawyer", "I'm looking for representation"
  • Shopping for attorneys or comparing options

**Existing Client** - ONLY if there is CLEAR EVIDENCE the caller THEMSELVES already has a case with this firm. Look for:
  • Explicit mention of case number, file number, or claim number FOR THEIR OWN CASE
  • Phrases like: "I'm calling about MY case", "I'm already a client", "MY lawyer", "MY attorney"
  • Asking for updates/status on "THEIR" case (not someone else's case)
  • Referencing previous calls/conversations with this firm specifically about THEIR OWN injury
  • Calling back about an ongoing case THEY'VE already opened for THEMSELVES
  • Mentions being represented by this firm or having signed with them
  • CRITICAL: If caller asks "Is the case still active?" or references "a client" or "this case" for SOMEONE ELSE, they are NOT an existing client - they are likely Attorney/Medical/Insurance
  • IMPORTANT: If caller just mentions calling before but no case is established, it's likely still a New Lead

**Attorney** - Caller is another attorney, law firm, legal professional, medical provider calling about liens, or opposing counsel (NOT a potential client or existing client)
  • Explicitly identifies as an attorney, lawyer, or legal professional
  • Asks if they are an attorney and confirms YES
  • Calling about "a client" or "their client" (not their own injury)
  • Opposing counsel calling about a case
  • Medical provider/biller calling about liens, payment, or billing for someone else's case
  • Asks about "claim number", "lien case", "is case active" for ANOTHER PERSON
  • Represents a law firm, medical office, or legal entity
  • Email domain suggests professional/business entity (not personal gmail/yahoo)
  • CRITICAL DISTINCTION: They reference cases/clients in third person, not first person

**Insurance** - Caller identifies as insurance company, adjuster, or discusses insurance claims/coverage from insurance company perspective
  • Works for insurance company
  • Insurance adjuster calling about a claim
  • Speaking from insurance company's perspective (not client talking about their insurance)

**Medical** - Anything related to medical providers, medical treatment, billing, or healthcare (not injury description for legal case)
  • Medical provider, hospital, radiology, or healthcare facility calling
  • Medical billing companies or medical revenue cycle companies
  • Calling about medical liens, payment, or billing for treatment
  • Primarily about treatment, medical records, or medical appointments
  • Healthcare staff calling about patient care or billing matters
  • Medical-related business calls (not patient calling about their own injury)

**Other** - Wrong number, spam, telemarketer, unrelated business, or cannot determine purpose
  • Clearly wrong number or misdial
  • Sales calls or spam
  • Unrelated to personal injury law
  • Cannot determine purpose from transcript

CRITICAL: When in doubt between New Lead and Existing Client, prefer "New Lead" UNLESS there is explicit evidence of an established case (case number, "my case", "my lawyer", etc.).

TRANSCRIPT:
${transcriptText}

First, briefly summarize what you understood from this call, then provide your categorization.

Respond in this exact format:
SUMMARY: [2-3 sentences summarizing the call's purpose and key points]
CATEGORY: [category name]
REASONING: [detailed explanation with specific quotes or keywords from the transcript that support your categorization]

Examples:
SUMMARY: Caller was in a car accident yesterday and is looking for legal representation. They asked if the firm handles car accidents and what the next steps would be.
CATEGORY: New Lead
REASONING: Caller used phrases "I was in an accident yesterday" and "Can you help me?" with no mention of existing case, file number, or prior representation. This is clearly a new inquiry.

SUMMARY: Caller is checking on the status of their personal injury case and wanted to know if there are any updates from the insurance company.
CATEGORY: Existing Client
REASONING: Caller said "I'm calling about my case" and referenced "my attorney" indicating an established client relationship with an active case.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,  // Increased for thorough analysis with summary and detailed reasoning
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const response = message.content[0].text.trim();

    // Parse response
    const categoryMatch = response.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);
    const reasoningMatch = response.match(/REASONING:\s*(.+?)$/is);

    let category = categoryMatch ? categoryMatch[1].trim() : 'Other';
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Auto-categorized';

    // Validate category
    const validCategories = ['New Lead', 'Existing Client', 'Attorney', 'Insurance', 'Medical', 'Other'];
    if (!validCategories.includes(category)) {
      category = 'Other';
    }

    return { category, reasoning };
  } catch (error) {
    console.error('Error categorizing transcript:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      type: error.constructor.name,
      response: error.response?.data || error.response
    });
    console.log('API Key prefix:', ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.substring(0, 10) : 'NOT SET');
    return { category: 'Other', reasoning: `Error: ${error.message || 'Unknown error'}` };
  }
}

// GET /api/categories - Get all stored categories
app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await readCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error reading categories:', error);
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

// POST /api/categorize-call - Categorize a single call
app.post('/api/categorize-call', async (req, res) => {
  try {
    const { call_id, transcript } = req.body;

    if (!call_id) {
      return res.status(400).json({ error: 'call_id is required' });
    }

    const result = await categorizeTranscript(transcript);

    // Save to categories file
    const categories = await readCategories();
    categories[call_id] = result;
    await writeCategories(categories);

    res.json({ call_id, ...result });
  } catch (error) {
    console.error('Error categorizing call:', error);
    res.status(500).json({ error: 'Failed to categorize call' });
  }
});

// POST /api/categorize-batch - Categorize multiple calls in batch
app.post('/api/categorize-batch', async (req, res) => {
  try {
    const { calls } = req.body;

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({ error: 'calls array is required' });
    }

    console.log(`Starting batch categorization of ${calls.length} calls...`);

    const categories = await readCategories();
    let processed = 0;
    let skipped = 0;

    // Process in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, Math.min(i + batchSize, calls.length));

      await Promise.all(batch.map(async (call) => {
        // Skip if already categorized
        if (categories[call.call_id]) {
          skipped++;
          return;
        }

        const result = await categorizeTranscript(call.transcript);
        categories[call.call_id] = result;
        processed++;

        console.log(`✓ Categorized call ${processed + skipped}/${calls.length}: ${call.call_id} → ${result.category} (${result.reasoning})`);
      }));

      // Save after each batch
      await writeCategories(categories);

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < calls.length) {
        await sleep(1000);
      }
    }

    console.log(`Batch categorization complete: ${processed} processed, ${skipped} skipped`);

    res.json({
      success: true,
      processed,
      skipped,
      total: calls.length,
      categories
    });
  } catch (error) {
    console.error('Error in batch categorization:', error);
    res.status(500).json({ error: 'Failed to categorize batch' });
  }
});

// POST /api/update-category - Manually override a call's category
app.post('/api/update-category', async (req, res) => {
  try {
    const { call_id, category, reasoning } = req.body;

    if (!call_id) {
      return res.status(400).json({ error: 'call_id is required' });
    }

    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }

    // Validate category
    const validCategories = ['New Lead', 'Existing Client', 'Attorney', 'Insurance', 'Medical', 'Other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Update category directly in database
    await writeCategory(call_id, {
      category,
      reasoning: reasoning || 'Manually categorized',
      manual: true,
      auto: false
    });

    console.log(`✓ Manually updated category for ${call_id} → ${category}`);

    res.json({ success: true, call_id, category, reasoning });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// POST /api/migrate-categories - Migrate categories from localStorage to database
app.post('/api/migrate-categories', async (req, res) => {
  try {
    const { categories } = req.body;

    if (!categories || typeof categories !== 'object') {
      return res.status(400).json({ error: 'categories object is required' });
    }

    console.log(`📦 Migrating ${Object.keys(categories).length} categories to database...`);

    // Write all categories to database
    await writeCategories(categories);

    console.log(`✅ Successfully migrated ${Object.keys(categories).length} categories to database`);

    res.json({
      success: true,
      migrated: Object.keys(categories).length,
      message: 'Categories successfully migrated to database'
    });
  } catch (error) {
    console.error('Error migrating categories:', error);
    res.status(500).json({ error: 'Failed to migrate categories' });
  }
});

// Railway will set PORT for us
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on ${PORT}`));
