require('dotenv').config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs").promises;
const Retell = require('retell-sdk').default;
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const compression = require('compression');
const { Resend } = require('resend');
const { sendNotifications, findOrCreateGHLContact } = require('./lib/ghlNotifications');
const { trackLead, updateLeadStatus, getLeadsByAgent, getLeadStats, getAllLeadStats } = require('./lib/leadTracking');
const { getClientConfig } = require('./config/clients');

const app = express();

/**
 * Generate a secure invitation code (8 chars, uppercase alphanumeric)
 */
function generateInvitationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing chars like 0,O,1,I
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a secure password reset token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Resend client for email sending
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send email via Resend (for password resets, notifications, welcome emails)
 * @param {string} toEmail - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Email body (plain text, newlines converted to <br>)
 * @param {string} fromName - Optional sender name (defaults to 'SaveYa Tech')
 * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
 */
async function sendEmail(toEmail, subject, body, fromName = 'SaveYa Tech') {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.log('❌ Resend API key not configured, skipping email');
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    console.log(`📧 sendEmail: Sending to ${toEmail}`);

    const { data, error } = await resend.emails.send({
      from: `${fromName} <notifications@saveyatech.com>`,
      to: toEmail,
      subject: subject,
      html: body.replace(/\n/g, '<br>')
    });

    if (error) {
      console.error('❌ Error sending email via Resend:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Email sent successfully to ${toEmail}`, data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Extract caller name from Retell call data
 * Tries multiple sources in priority order:
 * 1. extracted_data.name
 * 2. extracted_data.first_name + last_name
 * 3. call_analysis.call_summary (regex extraction)
 * 4. name field
 * @param {object} callData - Retell call object
 * @returns {string|null} - Extracted name or null
 */
function extractNameFromCall(callData) {
  // Generic terms to filter out
  const genericTerms = /^(the user|unknown|caller|client|agent|representative|user|n\/a|none|test)$/i;

  // Helper to check if a name is valid (not generic)
  const isValidName = (name) => {
    if (!name || typeof name !== 'string') return false;
    const cleaned = name.trim();
    if (cleaned.length < 2) return false;
    if (genericTerms.test(cleaned)) return false;
    return true;
  };

  // Priority 1: extracted_data.name (accept any non-generic name, even if unusual)
  if (callData.extracted_data?.name) {
    const name = callData.extracted_data.name.trim();
    if (isValidName(name)) {
      return name;
    }
  }

  // Priority 2: extracted_data.first_name + last_name
  if (callData.extracted_data?.first_name || callData.extracted_data?.last_name) {
    const firstName = callData.extracted_data.first_name?.trim() || '';
    const lastName = callData.extracted_data.last_name?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (isValidName(fullName)) {
      return fullName;
    }
    // If only first name and it's valid, use it
    if (isValidName(firstName) && !lastName) {
      return firstName;
    }
  }

  // Priority 3: Extract from call_analysis.call_summary using patterns
  if (callData.call_analysis?.call_summary) {
    const summary = callData.call_analysis.call_summary;

    // More permissive patterns - match any words that look like names
    const namePatterns = [
      /(?:The user|caller),\s+([A-Za-z][A-Za-z'\-\s]+?),/i,  // "The user, Name,"
      /(?:user'?s? name is|named?|called)\s+([A-Za-z][A-Za-z'\-\s]+?)(?:\.|,|\s+(?:called|contacted|reached|who|and))/i,  // "user's name is Name"
      /^([A-Za-z][A-Za-z'\-\s]+?)\s+(?:called|contacted|reached out)/i,  // "Name called"
      /identified (?:himself|herself|themselves) as ([A-Za-z][A-Za-z'\-\s]+?)(?:\.|,|\s+(?:who|and|to))/i,  // "identified as Name"
      /(?:I'm|I am|This is|My name is)\s+([A-Za-z][A-Za-z'\-\s]+?)(?:\.|,|\s+(?:and|calling|who))/i,  // "I'm Name"
      /from\s+([A-Za-z][A-Za-z'\-\s]+?)\s+(?:regarding|about|calling)/i,  // "from Name regarding"
    ];

    for (const pattern of namePatterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        const extractedName = match[1].trim();
        // Clean up - remove trailing words like "who", "and", etc.
        const cleanName = extractedName.replace(/\s+(who|and|to|from|that|with)$/i, '').trim();
        if (isValidName(cleanName)) {
          return cleanName;
        }
      }
    }
  }

  // Priority 4: Fallback to name field
  if (callData.name) {
    const name = callData.name.trim();
    if (isValidName(name)) {
      return name;
    }
  }

  return null;
}

// Enable gzip compression for all responses (reduces 221MB to ~20MB)
app.use(compression({
  level: 6, // Balance between speed and compression ratio
  threshold: 1024 // Only compress responses larger than 1KB
}));

app.use(express.json({ limit: '50mb' }));  // Allow large payloads for category migration
app.use(cookieParser());

// CORS - restrict to allowed origins only
const allowedOrigins = [
  'https://saveyatech.app',
  'https://client.saveyatech.app',
  'https://www.saveyatech.app',
  // Allow Vercel preview deployments
  /https:\/\/nodejs-.*-chris-lanzillis-projects\.vercel\.app$/,
  // Local development
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Check if origin matches allowed list
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Redirect client subdomain to client portal
app.use((req, res, next) => {
  const host = req.get('host') || '';
  if (host.startsWith('client.') && req.path === '/') {
    return res.redirect('/client-portal');
  }
  next();
});

// Serve the marketing site
const publicDir = path.join(__dirname, "public");

// Define routes BEFORE static middleware to override index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/client-portal", (_req, res) => {
  res.sendFile(path.join(publicDir, "client-portal.html"));
});

app.get("/client-dashboard", (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(publicDir, "client-dashboard.html"));
});

// Admin portal login page (public)
app.get("/admin-portal", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin-portal.html"));
});

// Admin dashboard (protected - requires authentication)
app.get("/admin", authenticateAdminToken, (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

// Now serve static files (styles.css, etc.)
app.use(express.static(publicDir));

// --- ENV VARS ---
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("CRITICAL: JWT_SECRET environment variable is not set!");
  console.error("Authentication will not work without this. Set it in Vercel project settings.");
}

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

// Initialize Anthropic client with timeout to prevent hanging
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  timeout: 30000, // 30 seconds - plenty for AI processing, but prevents indefinite hanging
  maxRetries: 2   // Retry twice on failure for reliability
});

// Initialize OpenAI client as backup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Disable TLS certificate validation for PostgreSQL connections
// This is needed for Supabase/Neon databases that use self-signed certificates
if (process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Initialize Postgres connection pool
// Use POOLING URL (pgbouncer) to prevent connection exhaustion
const dbConnectionString = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
const pool = new Pool({
  connectionString: dbConnectionString,
  ssl: dbConnectionString ? {
    rejectUnauthorized: false,
    // Additional SSL options to bypass certificate validation
    checkServerIdentity: () => undefined,
  } : false
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

    // Create clients table for multi-tenant auth
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        business_name TEXT NOT NULL,
        agent_ids TEXT[] NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        active BOOLEAN DEFAULT TRUE,
        ai_receptionist_name TEXT DEFAULT 'AI Receptionist',
        ai_receptionist_prompt TEXT
      )
    `);

    // Add AI receptionist columns if they don't exist (migration for existing tables)
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_receptionist_name TEXT DEFAULT 'AI Receptionist'
    `);
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_receptionist_prompt TEXT
    `);

    // Add ghl_location_id column for GHL integration
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS ghl_location_id TEXT
    `);

    // Set CourtLaw's ghl_location_id
    await client.query(`
      UPDATE clients SET ghl_location_id = 'lneM3M1j3P5i0JYeNK18'
      WHERE business_name = 'CourtLaw Injury Lawyers' AND ghl_location_id IS NULL
    `);

    // Add invitation code fields for team member self-registration
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS invitation_code TEXT UNIQUE
    `);
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS invitation_code_created_at TIMESTAMP
    `);
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS reset_token TEXT
    `);
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP
    `);

    // Create team_members table for client team management
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'Viewer',
        password_hash TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP,
        reset_token TEXT,
        reset_token_expires TIMESTAMP,
        UNIQUE(client_id, email),
        CONSTRAINT team_members_role_check CHECK (role IN ('Admin', 'Sales', 'Support', 'Viewer'))
      )
    `);

    // Add phone column to team_members if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone TEXT
    `);

    // Add password reset fields to team_members (migration for existing tables)
    await client.query(`
      ALTER TABLE team_members ADD COLUMN IF NOT EXISTS reset_token TEXT
    `);
    await client.query(`
      ALTER TABLE team_members ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP
    `);

    // Generate invitation codes for existing clients that don't have one
    const clientsWithoutCodes = await client.query(`
      SELECT id FROM clients WHERE invitation_code IS NULL
    `);
    for (const row of clientsWithoutCodes.rows) {
      const code = generateInvitationCode();
      await client.query(
        'UPDATE clients SET invitation_code = $1, invitation_code_created_at = NOW() WHERE id = $2',
        [code, row.id]
      );
    }

    // Update CourtLaw with Maria's AI receptionist info (one-time migration)
    await client.query(`
      UPDATE clients
      SET ai_receptionist_name = 'Maria',
          ai_receptionist_prompt = 'Maria is CourtLaw''s AI intake specialist with these key behaviors:
- Asks ONE question at a time (CRITICAL rule - never bundles questions)
- Uses 5th grade reading level, simple language
- Slow, clear, methodical pace
- Bilingual (English/Spanish)
- Warm, compassionate tone

CALLER WORKFLOWS:
1. Injured Party: Language → Location check (NJ/NY only) → Get story → Qualify → Collect info → Schedule callback
2. Medical Professional: Get info → Take message (NEVER gives case details)
3. Attorney: Get info → Take message (NEVER gives case details)
4. Other: Take message with full context

CASE TYPES HANDLED:
- Car accidents, Uber/Rideshare, Construction, Motorcycle, Truck/Bus/Taxi, Slip & Fall, Workers'' Compensation

KEY GUARDRAILS:
- NEVER provides legal advice or case predictions
- NEVER discusses settlement amounts
- Only handles NJ and NY cases
- Confirms all info (phone, email, names) by spelling back

INFORMATION COLLECTION (one at a time):
1. Full name
2. Phone number (repeat back)
3. Email (spell back)
4. Incident date (specific date required)
5. Location
6. How they heard about CourtLaw
7. Case-specific questions based on type'
      WHERE business_name = 'CourtLaw Injury Lawyers'
      AND (ai_receptionist_name IS NULL OR ai_receptionist_name = 'AI Receptionist')
    `);

    // Create admin_users table for admin dashboard authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP,
        CONSTRAINT admin_users_role_check CHECK (role IN ('super_admin', 'admin'))
      )
    `);

    // Create notification_recipients table for notification team members
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_recipients (
        id SERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        ghl_contact_id TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent_id, email)
      )
    `);

    // Create notification_preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        recipient_id INTEGER REFERENCES notification_recipients(id) ON DELETE CASCADE,
        new_lead_email BOOLEAN DEFAULT TRUE,
        new_lead_sms BOOLEAN DEFAULT TRUE,
        existing_client_email BOOLEAN DEFAULT TRUE,
        existing_client_sms BOOLEAN DEFAULT FALSE,
        attorney_email BOOLEAN DEFAULT TRUE,
        attorney_sms BOOLEAN DEFAULT FALSE,
        insurance_email BOOLEAN DEFAULT TRUE,
        insurance_sms BOOLEAN DEFAULT FALSE,
        medical_email BOOLEAN DEFAULT TRUE,
        medical_sms BOOLEAN DEFAULT FALSE,
        other_email BOOLEAN DEFAULT TRUE,
        other_sms BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(recipient_id)
      )
    `);

    console.log('✅ Database tables initialized');
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

      // CRITICAL: Merge in categories from categories.json
      const categories = await readCategories();
      const callsWithCategories = allCalls.map(call => ({
        ...call,
        category: categories[call.call_id]?.category || 'Uncategorized',
        reasoning: categories[call.call_id]?.reasoning || null,
        confidence: categories[call.call_id]?.confidence || null,
        phone_number: categories[call.call_id]?.phone_number || call.from_number || null
      }));

      res.json({ calls: callsWithCategories, total: callsWithCategories.length });
    } else {
      // Single page request
      const { limit = 100 } = req.query;
      const params = { limit: parseInt(limit) };
      if (agent_id) params.filter_criteria = { agent_id: [agent_id] };  // agent_id must be an array

      const data = await retellClient.call.list(params);

      // CRITICAL: Merge in categories from categories.json
      const categories = await readCategories();
      const calls = Array.isArray(data) ? data : (data.calls || []);
      const callsWithCategories = calls.map(call => ({
        ...call,
        category: categories[call.call_id]?.category || 'Uncategorized',
        reasoning: categories[call.call_id]?.reasoning || null,
        confidence: categories[call.call_id]?.confidence || null,
        phone_number: categories[call.call_id]?.phone_number || call.from_number || null
      }));

      res.json(Array.isArray(data) ? callsWithCategories : { ...data, calls: callsWithCategories });
    }
  } catch (error) {
    console.error("Error fetching calls:", error.message);
    res.status(500).json({ error: "Failed to fetch calls" });
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
    // Support incremental loading with since_timestamp parameter
    const sinceTimestamp = req.query.since_timestamp ? parseInt(req.query.since_timestamp) : null;

    if (sinceTimestamp) {
      console.log(`Fetching agent summary (incremental since ${new Date(sinceTimestamp).toISOString()})...`);
    } else {
      console.log('Fetching agent summary (full load)...');
    }

    // Fetch all agents
    const agentsData = await retryWithBackoff(() => retellClient.agent.list());
    const allAgents = agentsData.agents || agentsData || [];
    console.log(`Fetched ${allAgents.length} total agent versions`);

    // Add a small delay after fetching agents
    await sleep(500);

    // Fetch calls using SDK with pagination (optionally filtered by timestamp)
    let allCalls = [];
    let paginationKey = undefined;
    const pageSize = 1000;  // Request max per page
    let pageCount = 0;

    if (sinceTimestamp) {
      console.log('🔍 Fetching NEW calls only (incremental)...\n');
    } else {
      console.log('🔍 Fetching ALL calls with SDK pagination...\n');
    }

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
          // If we're doing incremental fetch, filter out old calls
          let filteredCalls = calls;
          if (sinceTimestamp) {
            filteredCalls = calls.filter(call => {
              const callTimestamp = call.start_timestamp || call.end_timestamp;
              return callTimestamp && callTimestamp > sinceTimestamp;
            });

            // If we got calls but none are new, we've reached the cutoff
            if (filteredCalls.length === 0) {
              console.log(`✓ Finished: Reached timestamp cutoff (${allCalls.length} new calls found)`);
              break;
            }
          }

          allCalls = allCalls.concat(filteredCalls);

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

    // Load categories from database
    console.log('\n📂 Loading categories from database...');
    const categories = await readCategories();
    console.log(`✅ Loaded ${Object.keys(categories).length} categories from database`);

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
          // Only essential fields - exclude transcripts for performance
          call_id: call.call_id,
          agent_id: call.agent_id,
          from_number: call.from_number,
          to_number: call.to_number,
          start_timestamp: call.start_timestamp,
          end_timestamp: call.end_timestamp,
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
        // Only include essential fields - exclude transcripts for performance (saves ~200MB)
        call_id: call.call_id,
        agent_id: call.agent_id,
        agent_name: agentIdToName.get(call.agent_id) || 'Unknown Agent',
        from_number: call.from_number,
        to_number: call.to_number,
        customer_number: call.customer_number,
        start_timestamp: call.start_timestamp,
        end_timestamp: call.end_timestamp,
        duration_minutes: call.end_timestamp && call.start_timestamp
          ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
          : 0,
        cost: (call.call_cost?.combined_cost || 0) / 100,  // Convert cents to dollars
        call_analysis: call.call_analysis,
        call_cost: call.call_cost,
        call_status: call.call_status,
        disconnection_reason: call.disconnection_reason,
        category: categories[call.call_id]?.category || null,  // Add category from database
        reasoning: categories[call.call_id]?.reasoning || null,
        manual: categories[call.call_id]?.manual || false,
        auto: categories[call.call_id]?.auto || false
        // transcript and transcript_object excluded - fetch separately when viewing call details
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
    const result = await pool.query('SELECT call_id, category, reasoning, manual, auto, confidence_score FROM call_categories');

    // Convert rows to object format { call_id: { category, reasoning, manual, auto, confidence_score } }
    const categories = {};
    result.rows.forEach(row => {
      categories[row.call_id] = {
        category: row.category,
        reasoning: row.reasoning,
        manual: row.manual,
        auto: row.auto,
        confidence_score: row.confidence_score ? parseFloat(row.confidence_score) : null
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

    // Convert confidence string to numeric score
    let confidenceScore = null;
    if (categoryData.confidence) {
      const confidence = categoryData.confidence.toUpperCase();
      if (confidence === 'HIGH') confidenceScore = 0.90;
      else if (confidence === 'MEDIUM') confidenceScore = 0.70;
      else if (confidence === 'LOW') confidenceScore = 0.50;
    }
    if (categoryData.confidence_score) {
      confidenceScore = categoryData.confidence_score;
    }

    await pool.query(`
      INSERT INTO call_categories (call_id, category, reasoning, manual, auto, confidence_score, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (call_id)
      DO UPDATE SET
        category = EXCLUDED.category,
        reasoning = EXCLUDED.reasoning,
        manual = EXCLUDED.manual,
        auto = EXCLUDED.auto,
        confidence_score = EXCLUDED.confidence_score,
        updated_at = NOW()
    `, [callId, category, reasoning || null, manual || false, auto || false, confidenceScore]);

    return true;
  } catch (error) {
    console.error('Error writing category to database:', error);
    return false;
  }
}

// Helper: Write multiple categories to Postgres database (batch) with deadlock retry
async function writeCategories(categories, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 100; // ms

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

        // Convert confidence string to numeric score
        let confidenceScore = null;
        if (typeof categoryData === 'object' && categoryData.confidence) {
          const confidence = categoryData.confidence.toUpperCase();
          if (confidence === 'HIGH') confidenceScore = 0.90;
          else if (confidence === 'MEDIUM') confidenceScore = 0.70;
          else if (confidence === 'LOW') confidenceScore = 0.50;
        }
        // Also check for numeric confidence_score directly
        if (typeof categoryData === 'object' && categoryData.confidence_score) {
          confidenceScore = categoryData.confidence_score;
        }

        await client.query(`
          INSERT INTO call_categories (call_id, category, reasoning, manual, auto, confidence_score, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (call_id)
          DO UPDATE SET
            category = EXCLUDED.category,
            reasoning = EXCLUDED.reasoning,
            manual = EXCLUDED.manual,
            auto = EXCLUDED.auto,
            confidence_score = EXCLUDED.confidence_score,
            updated_at = NOW()
        `, [callId, category, reasoning, manual, auto, confidenceScore]);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');

      // Retry on deadlock error (40P01)
      if (error.code === '40P01' && retryCount < MAX_RETRIES) {
        client.release();
        const delay = RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
        console.log(`⚠️  Deadlock detected, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return writeCategories(categories, retryCount + 1);
      }

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
// Helper function to check if phone number has called before as a lead/client
async function hasPhoneNumberCalledBefore(phoneNumber, allCallsWithCategories) {
  if (!phoneNumber || phoneNumber === 'N/A') return null;

  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

  // Check all previously categorized calls
  for (const [callId, category] of Object.entries(allCallsWithCategories)) {
    if (category.category === 'New Lead' || category.category === 'Existing Client') {
      // Find this call in the call history to get its phone number
      // Note: This would require fetching call details, which is expensive
      // For now, we'll track phone numbers in the category data itself
      return category;
    }
  }

  return null;
}

async function categorizeTranscript(transcript, phoneNumber = null) {
  if (!transcript || transcript.length === 0) {
    return { category: 'Other', reasoning: 'No transcript available', confidence: 'HIGH' };
  }

  // FIRST: Check if this phone number has called before as a New Lead or Existing Client
  if (phoneNumber && phoneNumber !== 'N/A') {
    const categories = await readCategories();

    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

    // Check all previous calls for this phone number
    for (const [callId, categoryData] of Object.entries(categories)) {
      if (categoryData.phone_number) {
        const prevPhone = categoryData.phone_number.replace(/[\s\-\(\)]/g, '');
        if (prevPhone === normalizedPhone) {
          // If this phone number was previously a New Lead or Existing Client, mark as Existing Client
          if (categoryData.category === 'New Lead' || categoryData.category === 'Existing Client') {
            console.log(`📞 Phone ${phoneNumber} previously called as "${categoryData.category}" → Auto-marking as "Existing Client"`);
            return {
              category: 'Existing Client',
              reasoning: `Returning caller - previously categorized as "${categoryData.category}" (phone: ${phoneNumber})`,
              phone_number: phoneNumber,
              confidence: 'HIGH'
            };
          }
        }
      }
    }
  }

  // Format transcript for Claude
  let transcriptText = '';
  if (Array.isArray(transcript)) {
    transcriptText = transcript.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  } else if (typeof transcript === 'string') {
    transcriptText = transcript;
  } else {
    return { category: 'Other', reasoning: 'Invalid transcript format', confidence: 'HIGH' };
  }

  const prompt = `You are analyzing a phone call transcript for CourtLaw, a personal injury law firm's AI receptionist.

CRITICAL PRIORITY: Identifying NEW LEADS (potential new clients) is the MOST IMPORTANT task. Missing a new client inquiry would be a critical business failure.

INSTRUCTIONS:
1. Read the ENTIRE transcript carefully from start to finish, paying special attention to the caller's opening statements
2. Identify WHO the caller is (injured person, medical provider, attorney, insurance adjuster, existing client)
3. Determine if they're calling about THEIR OWN injury or SOMEONE ELSE'S case
4. Look for explicit evidence of existing case (case numbers, "my case", "my attorney")
5. IMPORTANT DISTINCTION:
   - If call discusses an actual injury/legal matter but category is unclear → PREFER "New Lead" with HIGH confidence
   - If call is nonsensical, gibberish, or lacks ANY meaningful legal discussion → categorize as "Other"
   - If caller NEVER states their purpose (e.g., call ends during greeting) → categorize as "Other"
6. When uncertain between legitimate categories, PREFER "New Lead" over other categories to avoid missing potential clients
7. CRITICAL RULE: If you would categorize as "New Lead" but with LOW confidence → categorize as "Other" instead. Only mark as "New Lead" if you have MEDIUM or HIGH confidence.

Categorize this call into ONE of these categories:

**New Lead** - THE MOST IMPORTANT CATEGORY. Missing a new client is a critical business failure.
  • WHEN IN DOUBT BETWEEN NEW LEAD AND EXISTING CLIENT → CHOOSE NEW LEAD (safer to follow up than to miss)

  • AI RECEPTIONIST CLARIFYING QUESTIONS - Pay close attention to these exchanges:
    - If receptionist asks "Are you calling because you were injured?" and caller says YES → New Lead
    - If receptionist asks "Is this a new case or are you an existing client?" and caller says NEW → New Lead
    - If receptionist asks "Do you currently have a case with us?" and caller says NO → New Lead
    - If receptionist asks "Have you spoken with an attorney here before?" and caller says NO → New Lead
    - If caller says they are a "new client" or "first time calling about this" → New Lead

  • DEFINITIVE NEW LEAD INDICATORS (if ANY of these, categorize as New Lead):
    - Caller says they were "injured" when asked what type of caller they are
    - Caller describes an accident that happened to THEM (car crash, slip and fall, work injury, etc.)
    - Caller asks "Can you help me with..." or "Do you handle..." (exploring if firm can help)
    - Caller says "I was in an accident", "I got hurt", "I need a lawyer", "I'm looking for an attorney"
    - Caller asking about fees, process, or how to get started
    - Caller mentions an accident date (recent or past) for THEIR OWN injury
    - Caller provides details about THEIR injuries (broken bones, back pain, surgery, etc.)
    - Caller gives their contact info for the FIRST TIME (name, phone, email for callback)

  • NEW LEAD even if they called before - unless they have an ACTIVE CASE:
    - Caller says "I called before but never hired anyone" → Still New Lead
    - Caller says "I spoke to someone last week about my accident" but no case opened → Still New Lead
    - Caller asking about a NEW accident (even if they had a previous case) → New Lead for this accident
    - Caller says "No" when asked if they have an existing case → New Lead

  • SPECIFIC PHRASES THAT MEAN NEW LEAD:
    - "I was in a car accident" / "I got into an accident"
    - "I fell at [location]" / "I slipped and fell"
    - "I got hurt at work" / "I was injured on the job"
    - "I need to speak to a lawyer about my accident"
    - "Can you help me with my case?" (when no existing case established)
    - "I want to file a claim" / "I want to sue"
    - "Someone hit me" / "I was rear-ended"
    - "This is my first time calling" / "I'm a new client"

**Existing Client** - ONLY if there is CLEAR, EXPLICIT evidence of an ACTIVE case with THIS firm
  • DEFINITIVE EXISTING CLIENT INDICATORS (if ANY of these, categorize as Existing Client):
    - Caller says "I have my case with you" / "I have a case with you guys" / "my case is with you"
    - Caller says "I'm already working with [firm name]" (even if mispronounced like "four plow" for "CourtLaw")
    - Caller received a LETTER from the firm about their case (settlement offer, case update, etc.)
    - Caller mentions a settlement offer on THEIR case from defendant's insurance
    - Caller references a letter signed by an attorney at the firm (e.g., "Michael Labrada", "Karim")
    - Caller has specific accident date that matches correspondence from the firm

  • AI RECEPTIONIST CLARIFYING QUESTIONS - Pay close attention to these exchanges:
    - If receptionist asks "Do you have a case with us?" and caller says YES → Existing Client
    - If receptionist asks "Are you an existing client?" and caller says YES → Existing Client
    - If receptionist asks "Are you currently working with [firm] on your case?" and caller says YES → Existing Client
    - If caller provides a CASE NUMBER when asked → Existing Client
    - If caller names their attorney at the firm (e.g., "I work with Karim", "Michael Labrada") → Existing Client

  • MUST HAVE AT LEAST ONE OF THESE (not just "I called before"):
    - Caller explicitly says "I'm already a client" or "I'm one of your clients" or "Yes" to "are you existing client?"
    - Caller says "I'm calling about MY case" AND mentions case number or attorney name at firm
    - Caller says "MY lawyer is [name at CourtLaw]" or "MY attorney at your firm"
    - Caller references specific case details only an active client would know (settlement offers, letters received)
    - Caller says "I signed with you" or "You're representing me"
    - Caller knows their case number or file number
    - Caller received correspondence/letter from the firm about their active case

  • NOT EXISTING CLIENT (categorize as New Lead instead):
    - Just called before but no case was opened → New Lead
    - Left a message before but never spoke to anyone → New Lead
    - Had a consultation but didn't sign → New Lead
    - Says "No" or "I don't think so" when asked if they have a case → New Lead
    - Asking about "a case" in general (might be Attorney/Medical/Insurance asking about someone else)

  • CRITICAL: "Existing Client" requires ACTIVE representation, not just previous contact

**Attorney** - Caller is another attorney, law firm, or legal professional (NOT a potential client or existing client)
  • DEFINITIVE RULES (if ANY of these are true, categorize as Attorney):
    - Caller explicitly identifies as attorney, lawyer, paralegal, or legal professional
    - Caller says "I represent..." or "my client..." (legal representation language)
    - Email domain is a law firm (e.g., @smithlaw.com, @lawoffice.com)
  • IMPORTANT: The caller's initial answer is usually truthful - if they say "Attorney", trust that.
    However, if caller says "something else" but then clearly identifies as an attorney (by title,
    firm name, or legal representation language), prioritize the actual evidence.
  • Calling about "a client" or "their client" (not their own injury)
  • Opposing counsel calling about a case
  • CRITICAL: They reference cases/clients in THIRD PERSON, not first person

**Insurance** - Caller works for an insurance company (NOT a law firm, NOT a medical facility)
  • DEFINITIVE RULES (if ANY of these are true, categorize as Insurance):
    - Caller says they are "from [Company Name]" where company is a known insurer (e.g., "from Progressive")
    - Caller's email domain is an insurance company (e.g., @progressive.com, @geico.com, @statefarm.com)
    - Caller identifies as adjuster, claims rep, or says they work for an insurance company
  • IMPORTANT: The caller's initial answer is usually truthful - if they say "Insurance", trust that.
    However, if caller says "something else" but then clearly identifies as insurance (by company name,
    email domain, or role), prioritize the actual evidence and categorize as Insurance.
  • Identifies as: adjuster, claims representative, claims handler, or works for insurance company
  • WELL-KNOWN INSURANCE COMPANIES (recognize even without "insurance" in name):
    Progressive, State Farm, Geico, Allstate, Liberty Mutual, Farmers, USAA, Nationwide,
    Travelers, American Family, MetLife, Esurance, The Hartford, Kemper, Erie, Mercury,
    AAA, NJM, Plymouth Rock, Amica, Bristol West, Infinity, SafeAuto, Root, Lemonade
  • Discusses from INSURER perspective: coverage, liability determination, settlement offers, policy limits
  • May reference a claimant or injured party they are handling a claim for
  • CRITICAL DISTINCTIONS (do NOT confuse with other categories):
    - vs Attorney: Attorneys discuss LEGAL representation ("my client", "I represent"); Insurance discusses COVERAGE/LIABILITY
    - vs Medical: Medical providers discuss TREATMENT/BILLS/LIENS; Insurance discusses CLAIMS/COVERAGE/SETTLEMENT OFFERS
    - NOTE: All three (Attorney, Medical, Insurance) may mention claim numbers - that alone is NOT distinguishing
  • If unsure whether Insurance or Attorney: Does caller discuss coverage/liability (Insurance) or legal representation (Attorney)?
  • If unsure whether Insurance or Medical: Does caller work for insurer (Insurance) or healthcare facility (Medical)?

**Medical** - Medical providers, billing companies, medical records companies, or healthcare facilities calling about OTHER PEOPLE'S cases
  • DEFINITIVE RULES (if ANY of these are true, categorize as Medical):
    - Caller identifies as medical provider, doctor, nurse, billing department, or healthcare staff
    - Caller says they're from a hospital, clinic, radiology center, ASC, or medical facility
    - Caller discusses medical liens, treatment billing, or medical records for a PATIENT
    - Caller is from a MEDICAL RECORDS company (e.g., ChartSwap, Ciox Health, HealthMark, Verisma, MRO)
    - Caller is requesting or following up on medical records for a patient
  • IMPORTANT: The caller's initial answer is usually truthful - if they say "Medical", trust that.
    However, if caller says "something else" but then clearly identifies as medical (by facility name,
    role, or discussing patient billing/treatment/records), prioritize the actual evidence.
  • Medical billing companies or medical revenue cycle companies
  • Medical records retrieval companies (ChartSwap, Ciox, etc.) - these handle records requests for law firms
  • Calling about medical liens, settlement payment, billing, or MEDICAL RECORDS for a PATIENT (not themselves)
  • CRITICAL: They're calling about SOMEONE ELSE (a patient), not their own injury
  • Examples: "Integrated Specialty ASC", "XYZ Radiology", "ABC Billing Services", "Newark General Hospital", "ChartSwap", "Ciox Health"

**Other** - Wrong number, spam, telemarketer, unrelated business, nonsensical calls, calls that end during greeting, or cannot determine purpose
  • Clearly wrong number or misdial
  • Sales calls or spam
  • Unrelated to personal injury law
  • Nonsensical or gibberish calls with no meaningful content (e.g., caller only says "Yeah" repeatedly, fragmented speech with no clear purpose)
  • Very short disconnected calls (under 30 seconds with no substance)
  • Calls that end during initial greeting before caller states their purpose
  • Cannot determine ANY purpose from transcript
  • No discussion of injury, legal matter, medical billing, insurance, or attorney services
  • Low-confidence "New Lead" categorizations (if unsure, mark as Other)

CRITICAL DISTINCTION:
- "Other" = NO meaningful legal/injury discussion OR completely nonsensical OR caller never states purpose OR low-confidence new lead
- "New Lead" = ACTUAL injury/legal discussion WITH MEDIUM/HIGH CONFIDENCE but unclear if new vs existing client → prefer New Lead

When in doubt between New Lead and Existing Client (both involving actual injury discussion), prefer "New Lead" UNLESS there is explicit evidence of an established case (case number, "my case", "my lawyer", etc.).

CONFIDENCE THRESHOLD: Only categorize as "New Lead" if you have MEDIUM or HIGH confidence. If confidence would be LOW, use "Other" instead.

IMPORTANT: When writing your SUMMARY and REASONING, NEVER mention if the caller was upset about speaking with an AI, complained about automation, or expressed frustration about not speaking to a human. Focus only on the business purpose of the call and relevant case details. Keep summaries professional and business-focused.

TRANSCRIPT:
${transcriptText}

First, think step-by-step about this call, then provide your categorization with confidence level.

Respond in this exact format:
SUMMARY: [2-3 sentences summarizing the call's purpose and key points]
CATEGORY: [category name]
CONFIDENCE: [HIGH/MEDIUM/LOW - How confident are you in this categorization?]
REASONING: [detailed explanation with specific quotes or keywords from the transcript that support your categorization. Explain why you chose this category over alternatives.]

CONFIDENCE GUIDELINES:
- HIGH: Clear, unambiguous indicators (e.g., "I was in an accident yesterday", "I'm calling about my case #12345", "I'm from XYZ Medical calling about patient John Doe")
- MEDIUM: Likely correct but some ambiguity (e.g., mentioned calling before but unclear if case was opened)
- LOW: Uncertain, could be multiple categories (recommend manual review)

Examples:
SUMMARY: Caller was in a car accident yesterday and is looking for legal representation. They asked if the firm handles car accidents and what the next steps would be.
CATEGORY: New Lead
CONFIDENCE: HIGH
REASONING: Caller used phrases "I was in an accident yesterday" and "Can you help me?" with no mention of existing case, file number, or prior representation. This is clearly a new inquiry for legal services about their own injury.

SUMMARY: Caller is checking on the status of their personal injury case and wanted to know if there are any updates from the insurance company.
CATEGORY: Existing Client
CONFIDENCE: HIGH
REASONING: Caller said "I'm calling about my case" and referenced "my attorney" indicating an established client relationship with an active case for their own injury.

SUMMARY: Caller from Integrated Specialty ASC (medical facility) is asking about settlement payment timing for patient Barol Hamilton. They identified as a medical provider and are calling about billing/payment.
CATEGORY: Medical
CONFIDENCE: HIGH
REASONING: Caller explicitly identified as "medical provider" from a healthcare facility (ASC = Ambulatory Surgical Center) and is calling about SOMEONE ELSE'S case (patient Barol Hamilton), not their own injury. They're asking about settlement payment for billing purposes, which is clearly a medical provider inquiry, not an existing client following up on their own case.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',  // Claude 3.5 Haiku - improved accuracy over base Haiku
      max_tokens: 2000,  // Increased for deep reasoning and confidence scoring
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const response = message.content[0].text.trim();

    // Parse response
    const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=\nCATEGORY:)/is);
    const categoryMatch = response.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);
    const confidenceMatch = response.match(/CONFIDENCE:\s*(.+?)(?:\n|$)/i);
    const reasoningMatch = response.match(/REASONING:\s*(.+?)$/is);

    let category = categoryMatch ? categoryMatch[1].trim() : 'Other';
    const confidence = confidenceMatch ? confidenceMatch[1].trim().toUpperCase() : 'MEDIUM';
    let reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Auto-categorized';
    let summary = summaryMatch ? summaryMatch[1].trim() : reasoning.substring(0, 200);

    // Add confidence to reasoning
    reasoning = `[${confidence} CONFIDENCE] ${reasoning}`;

    // Validate category
    const validCategories = ['New Lead', 'Existing Client', 'Attorney', 'Insurance', 'Medical', 'Other'];
    if (!validCategories.includes(category)) {
      category = 'Other';
    }

    return { category, reasoning, summary, confidence, phone_number: phoneNumber };
  } catch (error) {
    console.error('Claude AI categorization failed:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      type: error.constructor.name,
      response: error.response?.data || error.response
    });
    console.log('Claude API Key prefix:', ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.substring(0, 10) : 'NOT SET');

    // Try OpenAI as backup
    console.log('🔄 Attempting fallback to OpenAI...');
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',  // Fast and cost-effective
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const response = completion.choices[0].message.content.trim();

      // Parse response (same format as Claude)
      const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=\nCATEGORY:)/is);
      const categoryMatch = response.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);
      const confidenceMatch = response.match(/CONFIDENCE:\s*(.+?)(?:\n|$)/i);
      const reasoningMatch = response.match(/REASONING:\s*(.+?)$/is);

      let category = categoryMatch ? categoryMatch[1].trim() : 'Other';
      const confidence = confidenceMatch ? confidenceMatch[1].trim().toUpperCase() : 'MEDIUM';
      let reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Auto-categorized';
      let summary = summaryMatch ? summaryMatch[1].trim() : reasoning.substring(0, 200);

      // Add confidence and backup indicator to reasoning
      reasoning = `[${confidence} CONFIDENCE - OpenAI Backup] ${reasoning}`;

      // Validate category
      const validCategories = ['New Lead', 'Existing Client', 'Attorney', 'Insurance', 'Medical', 'Other'];
      if (!validCategories.includes(category)) {
        category = 'Other';
      }

      console.log('✅ OpenAI backup categorization successful');
      return { category, reasoning, summary, confidence, phone_number: phoneNumber };
    } catch (backupError) {
      console.error('OpenAI backup also failed:', backupError);
      const errorMsg = `Error: Claude and OpenAI both failed. ${error.message || 'Unknown error'}`;
      return { category: 'Other', reasoning: errorMsg, summary: 'Call could not be automatically categorized', phone_number: phoneNumber };
    }
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

// In-memory deduplication cache for webhooks (prevents duplicate processing)
const processedWebhooks = new Set();
const WEBHOOK_DEDUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// DEBUG: Store last 20 webhook payloads for debugging
const webhookDebugLog = [];
const MAX_WEBHOOK_DEBUG = 20;

// GET /api/webhook-debug - View recent webhook payloads for debugging
app.get('/api/webhook-debug', (req, res) => {
  res.json({
    count: webhookDebugLog.length,
    webhooks: webhookDebugLog
  });
});

// POST /webhook/retell-call-ended - Retell webhook for call completion
app.post('/webhook/retell-call-ended', async (req, res) => {
  try {
    const callData = req.body;
    const eventType = callData.event;
    const callId = callData.call?.call_id || callData.call_id;
    const agentId = callData.call?.agent_id || callData.agent_id;

    // DEBUG: Log webhook to database
    try {
      await pool.query(`
        INSERT INTO activity_log (action, call_id, details, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [
        'webhook_received',
        callId || null,
        JSON.stringify({
          event: eventType || 'NONE',
          has_transcript: !!(callData.call?.transcript_object?.length || callData.call?.transcript),
          transcript_length: callData.call?.transcript_object?.length || 0
        })
      ]);
    } catch (dbErr) {
      console.error('Webhook debug log failed:', dbErr.message);
    }

    if (!callId) {
      console.error('❌ Webhook received without call_id');
      return res.status(400).send();
    }

    console.log(`\n📞 Retell webhook: ${callId.substring(0, 25)}... (event: ${eventType || 'none'})`);
    console.log(`   Agent: ${agentId?.substring(0, 25)}...`);

    // ONLY process call_ended events - ignore call_started and other events
    // call_started has no transcript (call hasn't happened yet)
    if (eventType && eventType !== 'call_ended' && eventType !== 'call_analyzed') {
      console.log(`   ⏭️  Ignoring ${eventType} event (waiting for call_ended)`);
      return res.status(204).send();
    }

    // DEDUPLICATION: Check if we already processed this call_id (in-memory for same instance)
    if (processedWebhooks.has(callId)) {
      console.log(`⚠️  DUPLICATE webhook ignored (in-memory) - call ${callId.substring(0, 30)}...`);
      return res.status(204).send();
    }

    // Mark as processed immediately (in-memory)
    processedWebhooks.add(callId);

    // Auto-cleanup after timeout to prevent memory leak
    setTimeout(() => {
      processedWebhooks.delete(callId);
    }, WEBHOOK_DEDUP_TIMEOUT);

    // DATABASE DEDUPLICATION: Check if call_id already exists (works across Vercel instances)
    try {
      const existingCategory = await pool.query(
        'SELECT call_id FROM call_categories WHERE call_id = $1',
        [callId]
      );
      if (existingCategory.rows.length > 0) {
        console.log(`⚠️  DUPLICATE webhook ignored (database) - call ${callId.substring(0, 30)}... already processed`);
        return res.status(204).send();
      }
    } catch (dbError) {
      console.error(`⚠️  Database dedup check failed, continuing: ${dbError.message}`);
      // Continue processing if database check fails - better to risk duplicate than miss notification
    }

    // Process categorization BEFORE responding (Vercel terminates after response)
    try {
        // Wait for transcript with retry - Retell may take time to process
        let fullCall;
        let transcript = [];
        const MAX_RETRIES = 12;  // 12 attempts × 5 seconds = 60 seconds max
        const RETRY_DELAY = 5000;

        console.log(`   ⏳ Waiting for transcript (up to 60 seconds)...`);

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          fullCall = await retellClient.call.retrieve(callId);
          transcript = fullCall.transcript_object || fullCall.transcript || [];

          if (transcript && transcript.length > 0) {
            console.log(`   ✅ Transcript ready after ${(attempt - 1) * 5}s (${Array.isArray(transcript) ? transcript.length + ' messages' : 'string'})`);
            break;
          }

          // Also check if call_summary is available as fallback
          if (fullCall.call_analysis?.call_summary) {
            console.log(`   📝 Using call_summary (transcript not ready): "${fullCall.call_analysis.call_summary.substring(0, 80)}..."`);
            transcript = fullCall.call_analysis.call_summary;
            break;
          }

          if (attempt < MAX_RETRIES) {
            console.log(`   ⏳ Attempt ${attempt}/${MAX_RETRIES}: No transcript yet, waiting 5s...`);
            await sleep(RETRY_DELAY);
          } else {
            console.log(`   ⚠️  No transcript after 60 seconds`);
          }
        }

        const phoneNumber = fullCall.from_number || fullCall.to_number;

        console.log(`   📝 Categorizing call...`);

        // Categorize with Claude
        const categoryResult = await categorizeTranscript(transcript, phoneNumber);

        // Save category (ONLY the new one, not all categories - prevents timeout)
        await writeCategories({ [callId]: { ...categoryResult, phone_number: phoneNumber } });

        console.log(`   ✅ Categorized as: ${categoryResult.category}`);

        // Track leads and conversions
        if (agentId) {
          // Extract ALL relevant data from transcript using AI (for all call types)
          console.log(`   🔍 Extracting data from transcript for ${categoryResult.category}...`);
          let extractedData = null;
          if (transcript) {
            try {
              const { extractAllCallData } = require('./lib/extractAllCallData');
              extractedData = await extractAllCallData(transcript, categoryResult.category);
              if (extractedData) {
                console.log(`   ✅ Data extracted successfully`);
                // Log what was found
                if (extractedData.email) console.log(`      Email: ${extractedData.email}`);
                if (extractedData.who_representing) console.log(`      Representing: ${extractedData.who_representing}`);
                if (extractedData.case_name) console.log(`      Case: ${extractedData.case_name}`);
                if (extractedData.claim_number) console.log(`      Claim #: ${extractedData.claim_number}`);
              }
            } catch (error) {
              console.error(`   ⚠️  Data extraction error:`, error.message);
            }
          }

          // Calculate call duration in seconds for filtering
          const durationSeconds = fullCall.end_timestamp && fullCall.start_timestamp
            ? Math.round((fullCall.end_timestamp - fullCall.start_timestamp) / 1000)
            : 0;

          // Build comprehensive call data with fallbacks
          const callData = {
            // Basic info
            name: extractedData?.name || extractNameFromCall(fullCall) || 'Unknown',
            phone: extractedData?.phone || phoneNumber,
            phone_number: phoneNumber,
            from_number: fullCall.from_number,
            to_number: fullCall.to_number,
            duration_seconds: durationSeconds,

            // Contact info
            email: extractedData?.email || fullCall.extracted_data?.email || null,

            // Attorney/Medical/Insurance/Other fields
            purpose: extractedData?.purpose || fullCall.call_analysis?.call_summary || categoryResult.reasoning,
            who_representing: extractedData?.who_representing || fullCall.extracted_data?.who_representing || null,
            representing_who: extractedData?.who_representing || fullCall.extracted_data?.representing_who || null,
            case_name: extractedData?.case_name || fullCall.extracted_data?.case_name || null,
            client_name: extractedData?.case_name || fullCall.extracted_data?.client_name || null,
            claim_number: extractedData?.claim_number || fullCall.extracted_data?.claim_number || null,
            claim_num: extractedData?.claim_number || fullCall.extracted_data?.claim_num || null,

            // New Lead base fields - use AI-extracted call_summary (filters out AI mentions, professional tone)
            call_summary: extractedData?.call_summary || fullCall.call_analysis?.call_summary || null,
            incident_description: extractedData?.call_summary || extractedData?.incident_description || categoryResult.summary || categoryResult.reasoning,
            incident_date: extractedData?.incident_date || null,
            incident_location: extractedData?.incident_location || null,
            case_type: extractedData?.case_type || null,

            // Case-Specific Fields (extracted by AI based on conversation)
            // Rideshare
            rideshare_role: extractedData?.rideshare_role || null,
            rideshare_service: extractedData?.rideshare_service || null,
            rideshare_driver_info: extractedData?.rideshare_driver_info || null,

            // Vehicle accidents
            vehicle_type: extractedData?.vehicle_type || null,
            fault_determination: extractedData?.fault_determination || null,
            police_report_filed: extractedData?.police_report_filed || null,
            other_party_insured: extractedData?.other_party_insured || null,
            injuries_sustained: extractedData?.injuries_sustained || null,

            // Construction
            construction_site_type: extractedData?.construction_site_type || null,
            injury_cause: extractedData?.injury_cause || null,
            employer_name: extractedData?.employer_name || null,
            safety_equipment: extractedData?.safety_equipment || null,

            // Slip & Fall
            property_type: extractedData?.property_type || null,
            fall_cause: extractedData?.fall_cause || null,
            property_owner: extractedData?.property_owner || null,
            witnesses_present: extractedData?.witnesses_present || null,

            // Workers' Compensation
            workplace_type: extractedData?.workplace_type || null,
            work_injury_type: extractedData?.work_injury_type || null,
            injury_reported: extractedData?.injury_reported || null,
            doctor_visit: extractedData?.doctor_visit || null,

            // Include any other extracted data from Retell
            ...fullCall.extracted_data
          };

          // Track lead
          try {
            const leadTrackingResult = await trackLead(callId, agentId, categoryResult.category, callData);
            if (leadTrackingResult) {
              if (leadTrackingResult.isNewLead) {
                console.log(`   📝 New lead tracked: ${callData.name || phoneNumber}`);
              }
              if (leadTrackingResult.conversionDetected) {
                console.log(`   🎉 CONVERSION DETECTED! Lead became client`);
              }
            }
          } catch (error) {
            console.error(`   ⚠️  Lead tracking error:`, error.message);
            // Don't fail the whole request if lead tracking fails
          }

          // Send notifications
          await sendNotifications(agentId, categoryResult.category, callData);
        }

      // Respond with 204 after successful processing
      res.status(204).send();

    } catch (error) {
      console.error(`❌ Error processing webhook for ${callId}:`, error.message);
      // Still respond with 204 even if processing fails (webhook was received)
      res.status(204).send();
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/send-notification-test - Test notification system
app.post('/api/send-notification-test', async (req, res) => {
  try {
    const { agent_id, category, call_data } = req.body;

    if (!agent_id || !category || !call_data) {
      return res.status(400).json({
        error: 'agent_id, category, and call_data are required'
      });
    }

    console.log(`\n🧪 TEST: Sending notification for ${category}`);

    const result = await sendNotifications(agent_id, category, call_data);

    res.json({
      success: true,
      message: 'Notification test sent',
      result: result
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/categorize-call - Categorize a single call
app.post('/api/categorize-call', async (req, res) => {
  try {
    const { call_id, transcript, phone_number, agent_id, call_data } = req.body;

    if (!call_id) {
      return res.status(400).json({ error: 'call_id is required' });
    }

    const result = await categorizeTranscript(transcript, phone_number);

    // Save to categories file
    const categories = await readCategories();
    categories[call_id] = result;
    await writeCategories(categories);

    // Track lead and detect conversions
    let leadTrackingResult = null;
    if (agent_id && call_data) {
      try {
        leadTrackingResult = await trackLead(call_id, agent_id, result.category, call_data);
        if (leadTrackingResult) {
          if (leadTrackingResult.isNewLead) {
            console.log(`📝 New lead tracked: ${call_data.name || call_data.phone}`);
          }
          if (leadTrackingResult.conversionDetected) {
            console.log(`🎉 CONVERSION! Lead converted to client`);
          }
        }
      } catch (error) {
        console.error('❌ Lead tracking error:', error.message);
        // Don't fail the whole request if lead tracking fails
      }
    }

    // Send notifications if agent_id and call_data are provided
    if (agent_id && call_data) {
      console.log(`\n🔔 Triggering notifications for call ${call_id} (category: ${result.category})`);

      // Don't wait for notifications to complete - send async
      sendNotifications(agent_id, result.category, call_data)
        .then((notifResult) => {
          console.log(`✅ Notifications sent for ${call_id}:`, notifResult);
        })
        .catch((error) => {
          console.error(`❌ Failed to send notifications for ${call_id}:`, error);
        });
    }

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

        const result = await categorizeTranscript(call.transcript, call.phone_number);
        categories[call.call_id] = result;
        processed++;

        console.log(`✓ Categorized call ${processed + skipped}/${calls.length}: ${call.call_id} → ${result.category} (${result.reasoning})`);

        // Track lead if this is a "New Lead" category and we have the required data
        if (result.category === 'New Lead' && call.agent_id && call.phone_number) {
          try {
            const callData = {
              phone: call.phone_number,
              phone_number: call.phone_number,
              name: call.caller_name || extractNameFromCall(call),
              email: null, // Batch calls typically don't have email extracted
              incident_description: result.summary || result.reasoning
            };

            const leadTrackingResult = await trackLead(call.call_id, call.agent_id, result.category, callData);
            if (leadTrackingResult && leadTrackingResult.isNewLead) {
              console.log(`   📝 New lead tracked from batch: ${callData.name || call.phone_number}`);
            }
          } catch (error) {
            console.error(`   ❌ Lead tracking error for ${call.call_id}:`, error.message);
          }
        }
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

// POST /api/save-categories - Save multiple categories to database without AI categorization
app.post('/api/save-categories', async (req, res) => {
  try {
    const { categories } = req.body;

    if (!categories || typeof categories !== 'object') {
      return res.status(400).json({ error: 'categories object is required' });
    }

    console.log(`Saving ${Object.keys(categories).length} categories to database...`);

    // Save to database
    await writeCategories(categories);

    res.json({
      success: true,
      saved: Object.keys(categories).length
    });
  } catch (error) {
    console.error('Error saving categories:', error);
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

// POST /api/update-category - Manually override a call's category
app.post('/api/update-category', async (req, res) => {
  try {
    const { call_id, category, reasoning, send_notifications } = req.body;

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

    // Check if category is changing FROM "New Lead" to something else
    // If so, we need to remove the lead from the leads table
    let previousCategory = null;
    let leadRemoved = false;
    try {
      const existingCategory = await pool.query(
        'SELECT category FROM call_categories WHERE call_id = $1',
        [call_id]
      );
      if (existingCategory.rows.length > 0) {
        previousCategory = existingCategory.rows[0].category;
      }

      // If changing FROM "New Lead" to something else, delete the lead
      if (previousCategory === 'New Lead' && category !== 'New Lead') {
        const deleteResult = await pool.query(
          'DELETE FROM leads WHERE call_id = $1 RETURNING id',
          [call_id]
        );
        if (deleteResult.rows.length > 0) {
          leadRemoved = true;
          console.log(`   🗑️  Removed lead (ID: ${deleteResult.rows[0].id}) - category changed from New Lead to ${category}`);
        }
      }
    } catch (error) {
      console.error('Error checking/removing lead:', error.message);
      // Continue with category update even if lead removal fails
    }

    // Update category directly in database
    await writeCategory(call_id, {
      category,
      reasoning: reasoning || 'Manually categorized',
      manual: true,
      auto: false
    });

    console.log(`✓ Manually updated category for ${call_id} → ${category}`);

    // Trigger notifications if requested (default: true)
    const shouldSendNotifications = send_notifications !== false; // Default to true unless explicitly false

    // Always process lead tracking for "New Lead" category, and notifications if enabled
    // This runs async to not block the response
    if (category === 'New Lead' || shouldSendNotifications) {
      (async () => {
        try {
          // Fetch full call details from Retell
          const fullCall = await retellClient.call.retrieve(call_id);
          const transcript = fullCall.transcript_object || fullCall.transcript || [];
          const phoneNumber = fullCall.from_number || fullCall.to_number;
          const agentId = fullCall.agent_id;

          if (!agentId) {
            console.error(`   ❌ No agent_id found for call ${call_id}`);
            return;
          }

          // Extract ALL relevant data from transcript using AI
          console.log(`   🔍 Extracting data from transcript for ${category}...`);
          let extractedData = null;
          if (transcript) {
            try {
              const { extractAllCallData } = require('./lib/extractAllCallData');
              extractedData = await extractAllCallData(transcript, category);
              if (extractedData) {
                console.log(`   ✅ Data extracted successfully`);
              }
            } catch (error) {
              console.error(`   ⚠️  Data extraction error:`, error.message);
            }
          }

          // Build comprehensive call data (same as webhook does)
          const callData = {
            // Basic info
            name: extractedData?.name || extractNameFromCall(fullCall) || 'Unknown',
            phone: extractedData?.phone || phoneNumber,
            phone_number: phoneNumber,
            from_number: fullCall.from_number,
            to_number: fullCall.to_number,

            // Contact info
            email: extractedData?.email || fullCall.extracted_data?.email || null,

            // Attorney/Medical/Insurance/Other fields
            purpose: extractedData?.purpose || fullCall.call_analysis?.call_summary || reasoning,
            who_representing: extractedData?.who_representing || fullCall.extracted_data?.who_representing || null,
            representing_who: extractedData?.who_representing || fullCall.extracted_data?.representing_who || null,
            case_name: extractedData?.case_name || fullCall.extracted_data?.case_name || null,
            client_name: extractedData?.case_name || fullCall.extracted_data?.client_name || null,
            claim_number: extractedData?.claim_number || fullCall.extracted_data?.claim_number || null,
            claim_num: extractedData?.claim_number || fullCall.extracted_data?.claim_num || null,

            // New Lead base fields - use Retell's call_summary (better quality) as primary
            call_summary: fullCall.call_analysis?.call_summary || null,
            incident_description: fullCall.call_analysis?.call_summary || extractedData?.incident_description || reasoning,
            incident_date: extractedData?.incident_date || null,
            incident_location: extractedData?.incident_location || null,
            case_type: extractedData?.case_type || null,

            // Case-Specific Fields (extracted by AI based on conversation)
            // Rideshare
            rideshare_role: extractedData?.rideshare_role || null,
            rideshare_service: extractedData?.rideshare_service || null,
            rideshare_driver_info: extractedData?.rideshare_driver_info || null,

            // Vehicle accidents
            vehicle_type: extractedData?.vehicle_type || null,
            fault_determination: extractedData?.fault_determination || null,
            police_report_filed: extractedData?.police_report_filed || null,
            other_party_insured: extractedData?.other_party_insured || null,
            injuries_sustained: extractedData?.injuries_sustained || null,

            // Construction
            construction_site_type: extractedData?.construction_site_type || null,
            injury_cause: extractedData?.injury_cause || null,
            employer_name: extractedData?.employer_name || null,
            safety_equipment: extractedData?.safety_equipment || null,

            // Slip & Fall
            property_type: extractedData?.property_type || null,
            fall_cause: extractedData?.fall_cause || null,
            property_owner: extractedData?.property_owner || null,
            witnesses_present: extractedData?.witnesses_present || null,

            // Workers' Compensation
            workplace_type: extractedData?.workplace_type || null,
            work_injury_type: extractedData?.work_injury_type || null,
            injury_reported: extractedData?.injury_reported || null,
            doctor_visit: extractedData?.doctor_visit || null,

            // Include any other extracted data from Retell
            ...fullCall.extracted_data
          };

          // Track lead if category is "New Lead" (always runs regardless of notification setting)
          if (category === 'New Lead') {
            try {
              console.log(`   📝 Tracking lead for manual "New Lead" categorization...`);
              const leadTrackingResult = await trackLead(call_id, agentId, category, callData);
              if (leadTrackingResult && leadTrackingResult.isNewLead) {
                console.log(`   ✅ New lead added to tracker: ${callData.name || phoneNumber}`);
              } else if (leadTrackingResult) {
                console.log(`   ℹ️  Lead already exists in tracker`);
              }
            } catch (leadError) {
              console.error(`   ⚠️  Lead tracking error:`, leadError.message);
              // Don't fail the whole operation if lead tracking fails
            }
          }

          // Send notifications only if enabled
          if (shouldSendNotifications) {
            console.log(`   📤 Sending notifications for ${category}...`);
            await sendNotifications(agentId, category, callData);
            console.log(`   ✅ Notifications sent for manual category change`);
          }

        } catch (error) {
          console.error(`   ❌ Error processing manual category change:`, error.message);
        }
      })(); // Execute immediately
    }

    res.json({
      success: true,
      call_id,
      category,
      previous_category: previousCategory,
      reasoning,
      notifications_triggered: shouldSendNotifications,
      lead_removed: leadRemoved
    });
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

// ============ AUTHENTICATION MIDDLEWARE ============

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Middleware to verify admin JWT token
function authenticateAdminToken(req, res, next) {
  const token = req.cookies.admin_auth_token;

  if (!token) {
    // For API routes, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }
    // For page routes, redirect to admin login
    return res.redirect('/admin-portal');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify this is an admin token
    if (!decoded.is_admin) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      return res.redirect('/admin-portal');
    }
    req.admin = decoded;
    next();
  } catch (error) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Invalid admin token' });
    }
    return res.redirect('/admin-portal');
  }
}

// Permission middleware - checks if user has required permission
// Permissions: view, export, manage_team
function requirePermission(permission) {
  return (req, res, next) => {
    // Client owners have all permissions
    if (!req.user.is_team_member) {
      return next();
    }

    // Define role permissions
    const rolePermissions = {
      'Admin': ['view', 'export', 'manage_categories'],
      'Sales': ['view', 'export'],
      'Support': ['view'],
      'Viewer': ['view']
    };

    const userPermissions = rolePermissions[req.user.role] || [];

    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
        role: req.user.role
      });
    }

    next();
  };
}

// Activity logging middleware for team members
async function logActivity(action, details = {}) {
  return async (req, res, next) => {
    // Only log for team members
    if (req.user && req.user.is_team_member) {
      try {
        await pool.query(
          'INSERT INTO activity_log (team_member_id, client_id, action, details) VALUES ($1, $2, $3, $4)',
          [req.user.id, req.user.client_id, action, JSON.stringify(details)]
        );
      } catch (error) {
        console.error('Failed to log activity:', error);
        // Don't fail the request if logging fails
      }
    }
    next();
  };
}

// ============ CLIENT PORTAL AUTH ROUTES ============

// POST /api/auth/login - Client login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find client in database
    const result = await pool.query(
      'SELECT * FROM clients WHERE email = $1 AND active = TRUE',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const client = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, client.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login timestamp
    await pool.query(
      'UPDATE clients SET last_login = NOW() WHERE id = $1',
      [client.id]
    );

    // Create JWT token (no expiration - stays logged in forever)
    const token = jwt.sign(
      {
        id: client.id,
        email: client.email,
        business_name: client.business_name,
        agent_ids: client.agent_ids
      },
      JWT_SECRET
    );

    // Set cookie (expires in 10 years)
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
      sameSite: 'lax'
    });

    res.json({
      success: true,
      client: {
        email: client.email,
        business_name: client.business_name,
        agent_ids: client.agent_ids
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Client logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// GET /api/auth/me - Get current logged in client (owner only, not team members)
app.get('/api/auth/me', authenticateToken, (req, res) => {
  // Team members should use /api/team/auth/me instead
  if (req.user.is_team_member) {
    return res.status(403).json({ error: 'Use team member auth endpoint' });
  }
  res.json({
    email: req.user.email,
    business_name: req.user.business_name,
    agent_ids: req.user.agent_ids,
    is_team_member: false
  });
});

// POST /api/auth/change-password - Change password for logged in client
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Get client from database
    const result = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND active = TRUE',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = result.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, client.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE clients SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    console.log(`Password changed for client ${client.email}`);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============ ADMIN AUTHENTICATION ROUTES ============

// POST /api/admin/auth/login - Admin login
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find admin in database
    const result = await pool.query(
      'SELECT * FROM admin_users WHERE email = $1 AND active = TRUE',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login timestamp
    await pool.query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
      [admin.id]
    );

    // Create JWT token (expires in 24 hours for admin - more secure)
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        is_admin: true
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set cookie (expires in 24 hours)
    res.cookie('admin_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    });

    console.log(`Admin logged in: ${admin.email}`);

    res.json({
      success: true,
      admin: {
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/admin/auth/logout - Admin logout
app.post('/api/admin/auth/logout', (req, res) => {
  res.clearCookie('admin_auth_token');
  res.json({ success: true });
});

// POST /api/admin/auth/seed - Create initial admin user (only works if no admin users exist)
app.post('/api/admin/auth/seed', async (req, res) => {
  try {
    // Check if any admin users exist
    const existingAdmins = await pool.query('SELECT COUNT(*) FROM admin_users');
    if (parseInt(existingAdmins.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Admin users already exist. Cannot seed.' });
    }

    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'super_admin')
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), passwordHash, name]
    );

    console.log(`Initial admin user created: ${email}`);

    res.json({
      success: true,
      message: 'Initial admin user created successfully',
      admin: result.rows[0]
    });
  } catch (error) {
    console.error('Admin seed error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// GET /api/admin/auth/me - Get current logged in admin
app.get('/api/admin/auth/me', authenticateAdminToken, (req, res) => {
  res.json({
    email: req.admin.email,
    name: req.admin.name,
    role: req.admin.role
  });
});

// ============ TEAM MEMBER ROUTES ============

// GET /api/team/members - List all team members for authenticated client
app.get('/api/team/members', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, active, created_at, last_login FROM team_members WHERE client_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({ members: result.rows });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/team/members - Create new team member
app.post('/api/team/members', authenticateToken, async (req, res) => {
  try {
    const { email, name, role, password } = req.body;

    if (!email || !name || !role || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const validRoles = ['Admin', 'Sales', 'Support', 'Viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert team member
    const result = await pool.query(`
      INSERT INTO team_members (client_id, email, name, role, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, name, role, active, created_at
    `, [req.user.id, email.toLowerCase(), name, role, password_hash]);

    res.json({
      success: true,
      member: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Email already exists for this client' });
    }
    console.error('Error creating team member:', error);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

// PUT /api/team/members/:id - Update team member
app.put('/api/team/members/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, role, password, active } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email.toLowerCase());
    }
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (role !== undefined) {
      const validRoles = ['Admin', 'Sales', 'Support', 'Viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const password_hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(password_hash);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    values.push(req.user.id);

    const result = await pool.query(`
      UPDATE team_members
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND client_id = $${paramIndex + 1}
      RETURNING id, email, name, role, active, updated_at
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    res.json({
      success: true,
      member: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// DELETE /api/team/members/:id - Delete/deactivate team member
app.delete('/api/team/members/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete by setting active = false
    const result = await pool.query(
      'UPDATE team_members SET active = FALSE, updated_at = NOW() WHERE id = $1 AND client_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// ============ ACTIVITY LOG ROUTES ============

// GET /api/activity - Get activity log for client
app.get('/api/activity', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.is_team_member ? req.user.client_id : req.user.id;

    const result = await pool.query(`
      SELECT
        al.id,
        al.action,
        al.call_id,
        al.details,
        al.created_at,
        tm.name as team_member_name,
        tm.email as team_member_email,
        tm.role as team_member_role
      FROM activity_log al
      LEFT JOIN team_members tm ON al.team_member_id = tm.id
      WHERE al.client_id = $1
      ORDER BY al.created_at DESC
      LIMIT 100
    `, [clientId]);

    res.json({ activities: result.rows });
  } catch (error) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

// ============ TEAM MEMBER AUTH ROUTES ============

// POST /api/team/auth/login - Team member login
app.post('/api/team/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find team member by email
    const result = await pool.query(
      'SELECT tm.*, c.business_name, c.agent_ids FROM team_members tm JOIN clients c ON tm.client_id = c.id WHERE tm.email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const teamMember = result.rows[0];

    // Check if team member is active
    if (!teamMember.active) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, teamMember.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE team_members SET last_login = NOW(), updated_at = NOW() WHERE id = $1',
      [teamMember.id]
    );

    // Create JWT token with team member info
    const token = jwt.sign(
      {
        id: teamMember.id,
        email: teamMember.email,
        name: teamMember.name,
        role: teamMember.role,
        client_id: teamMember.client_id,
        business_name: teamMember.business_name,
        agent_ids: teamMember.agent_ids,
        is_team_member: true
      },
      JWT_SECRET
    );

    // Set cookie (expires in 10 years)
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    // Log activity
    await pool.query(
      'INSERT INTO activity_log (team_member_id, client_id, action, details) VALUES ($1, $2, $3, $4)',
      [teamMember.id, teamMember.client_id, 'login', JSON.stringify({ email: teamMember.email })]
    );

    res.json({
      success: true,
      teamMember: {
        email: teamMember.email,
        name: teamMember.name,
        role: teamMember.role,
        business_name: teamMember.business_name
      }
    });
  } catch (error) {
    console.error('Team member login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/team/auth/me - Get current team member info
app.get('/api/team/auth/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_team_member) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    res.json({
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      client_id: req.user.client_id,
      business_name: req.user.business_name,
      agent_ids: req.user.agent_ids,
      is_team_member: true
    });
  } catch (error) {
    console.error('Error getting team member info:', error);
    res.status(500).json({ error: 'Failed to get team member info' });
  }
});

// ============ INVITATION CODE SYSTEM ============

// POST /api/team/validate-code - Validate invitation code (public)
app.post('/api/team/validate-code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const result = await pool.query(
      'SELECT id, business_name FROM clients WHERE invitation_code = $1 AND active = TRUE',
      [code.toUpperCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invitation code' });
    }

    res.json({
      valid: true,
      business_name: result.rows[0].business_name
    });
  } catch (error) {
    console.error('Error validating code:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

// POST /api/team/register - Team member self-registration with invitation code (public)
app.post('/api/team/register', async (req, res) => {
  try {
    const { code, email, name, password, phone } = req.body;

    if (!code || !email || !name || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find the client by invitation code
    const clientResult = await pool.query(
      'SELECT id, business_name, ghl_location_id FROM clients WHERE invitation_code = $1 AND active = TRUE',
      [code.toUpperCase().trim()]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invitation code' });
    }

    const client = clientResult.rows[0];

    // Check if email already exists
    const existingCheck = await pool.query(
      'SELECT id FROM team_members WHERE email = $1 AND client_id = $2',
      [email.toLowerCase(), client.id]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create team member (default role is Viewer for self-registration)
    const result = await pool.query(`
      INSERT INTO team_members (client_id, email, name, phone, role, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, name, phone, role
    `, [client.id, email.toLowerCase(), name, phone || null, 'Viewer', password_hash]);

    // Send welcome email via Resend (non-blocking)
    sendEmail(email, 'Welcome to ' + client.business_name,
      `Hi ${name},\n\nYour account has been created successfully!\n\nYou can now log in at: https://client.saveyatech.app\n\nBest regards,\n${client.business_name}`,
      client.business_name
    ).catch(err => console.error('Failed to send welcome email:', err));

    res.json({
      success: true,
      message: 'Account created successfully! You can now log in.',
      member: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error registering team member:', error);
    res.status(500).json({ error: 'Failed to create account', details: error.message });
  }
});

// POST /api/team/forgot-password - Request password reset for team members OR business owners (public)
// Rate limiting: prevent duplicate emails within 2 minutes
const recentResetRequests = new Map();
app.post('/api/team/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailLower = email.toLowerCase();
    console.log(`🔐 Password reset requested for: ${emailLower}`);

    // Check for recent reset request (within 2 minutes) - prevent duplicate emails
    const lastRequest = recentResetRequests.get(emailLower);
    if (lastRequest && Date.now() - lastRequest < 120000) {
      console.log(`⏳ Rate limit: Reset already sent to ${emailLower} within last 2 minutes`);
      return res.json({ success: true, message: 'If an account exists with this email, you will receive a reset link.' });
    }

    // First, check team_members table
    console.log(`🔍 Checking team_members table for: ${emailLower}`);
    const teamResult = await pool.query(`
      SELECT tm.id, tm.email, tm.name, c.business_name, c.ghl_location_id
      FROM team_members tm
      JOIN clients c ON tm.client_id = c.id
      WHERE tm.email = $1 AND tm.active = TRUE
    `, [emailLower]);

    console.log(`📊 Team members found: ${teamResult.rows.length}`);
    if (teamResult.rows.length > 0) {
      // Found team member
      const member = teamResult.rows[0];
      console.log(`✅ Found team member: ${member.email} for ${member.business_name}`);
      const resetToken = generateResetToken();
      const expires = new Date(Date.now() + 3600000); // 1 hour

      await pool.query(
        'UPDATE team_members SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [resetToken, expires, member.id]
      );

      const resetUrl = `https://client.saveyatech.app/client-portal.html?reset=${resetToken}&type=team`;

      // Send email and wait for result
      console.log(`📧 Sending password reset email to: ${member.email}`);
      const emailResult = await sendEmail(member.email, 'Reset Your Password',
        `Hi ${member.name},\n\nYou requested a password reset for your ${member.business_name} account.\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nSaveYa Tech`
      );
      console.log(`📧 Password reset email result:`, emailResult);

      // Mark this email as recently requested
      recentResetRequests.set(emailLower, Date.now());

      return res.json({ success: true, message: 'If an account exists with this email, you will receive a reset link.' });
    }

    // Check clients table (business owners)
    console.log(`🔍 Checking clients table for: ${emailLower}`);
    const clientResult = await pool.query(
      'SELECT id, email, business_name, ghl_location_id FROM clients WHERE email = $1 AND active = TRUE',
      [emailLower]
    );

    console.log(`📊 Clients found: ${clientResult.rows.length}`);
    if (clientResult.rows.length > 0) {
      // Found business owner
      const client = clientResult.rows[0];
      console.log(`✅ Found client/business owner: ${client.email} for ${client.business_name}`);
      const resetToken = generateResetToken();
      const expires = new Date(Date.now() + 3600000); // 1 hour

      await pool.query(
        'UPDATE clients SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [resetToken, expires, client.id]
      );

      const resetUrl = `https://client.saveyatech.app/client-portal.html?reset=${resetToken}&type=client`;

      // Send email and wait for result
      console.log(`📧 Sending password reset email to: ${client.email}`);
      const emailResult = await sendEmail(client.email, 'Reset Your Password',
        `Hi,\n\nYou requested a password reset for your ${client.business_name} account.\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nSaveYa Tech`
      );
      console.log(`📧 Password reset email result:`, emailResult);

      // Mark this email as recently requested
      recentResetRequests.set(emailLower, Date.now());

      return res.json({ success: true, message: 'If an account exists with this email, you will receive a reset link.' });
    }

    // Email not found in either table - return success anyway to prevent enumeration
    console.log(`❌ Email not found in any table: ${emailLower}`);
    res.json({ success: true, message: 'If an account exists with this email, you will receive a reset link.' });
  } catch (error) {
    console.error('Error sending reset email:', error);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// POST /api/team/reset-password - Reset password with token for team members OR business owners (public)
app.post('/api/team/reset-password', async (req, res) => {
  try {
    const { token, password, type } = req.body;

    console.log(`🔑 Reset password attempt - type: ${type}, token prefix: ${token?.substring(0, 10)}...`);

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // If type is specified, check only that table
    if (type === 'client') {
      // First, let's see what's in the database for debugging
      const debugResult = await pool.query(
        'SELECT id, reset_token, reset_token_expires, reset_token_expires > NOW() as not_expired FROM clients WHERE reset_token IS NOT NULL LIMIT 5'
      );
      console.log('🔍 Debug - Clients with reset tokens:', debugResult.rows.map(r => ({
        id: r.id,
        tokenPrefix: r.reset_token?.substring(0, 10),
        expires: r.reset_token_expires,
        notExpired: r.not_expired
      })));

      const result = await pool.query(
        'SELECT id FROM clients WHERE reset_token = $1 AND reset_token_expires > NOW() AND active = TRUE',
        [token]
      );
      console.log(`🔍 Query result for token: ${result.rows.length} rows found`);

      if (result.rows.length === 0) {
        // Check if token exists but is expired
        const expiredCheck = await pool.query(
          'SELECT id, reset_token_expires FROM clients WHERE reset_token = $1',
          [token]
        );
        if (expiredCheck.rows.length > 0) {
          console.log(`⚠️ Token found but expired at: ${expiredCheck.rows[0].reset_token_expires}`);
        } else {
          console.log(`❌ Token not found in database`);
        }
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      await pool.query(
        'UPDATE clients SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2',
        [password_hash, result.rows[0].id]
      );
      return res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
    }

    if (type === 'team') {
      const result = await pool.query(
        'SELECT id FROM team_members WHERE reset_token = $1 AND reset_token_expires > NOW() AND active = TRUE',
        [token]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      await pool.query(
        'UPDATE team_members SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2',
        [password_hash, result.rows[0].id]
      );
      return res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
    }

    // No type specified - check team_members first, then clients
    let result = await pool.query(
      'SELECT id FROM team_members WHERE reset_token = $1 AND reset_token_expires > NOW() AND active = TRUE',
      [token]
    );

    if (result.rows.length > 0) {
      await pool.query(
        'UPDATE team_members SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2',
        [password_hash, result.rows[0].id]
      );
      return res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
    }

    // Check clients table
    result = await pool.query(
      'SELECT id FROM clients WHERE reset_token = $1 AND reset_token_expires > NOW() AND active = TRUE',
      [token]
    );

    if (result.rows.length > 0) {
      await pool.query(
        'UPDATE clients SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2',
        [password_hash, result.rows[0].id]
      );
      return res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
    }

    return res.status(400).json({ error: 'Invalid or expired reset token' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/client/invitation-code - Get client's invitation code (owner only)
app.get('/api/client/invitation-code', authenticateToken, async (req, res) => {
  try {
    if (req.user.is_team_member) {
      return res.status(403).json({ error: 'Only business owners can access this' });
    }

    const result = await pool.query(
      'SELECT invitation_code, invitation_code_created_at FROM clients WHERE id = $1',
      [req.user.id]
    );

    res.json({
      invitation_code: result.rows[0]?.invitation_code,
      created_at: result.rows[0]?.invitation_code_created_at
    });
  } catch (error) {
    console.error('Error getting invitation code:', error);
    res.status(500).json({ error: 'Failed to get invitation code' });
  }
});

// POST /api/client/regenerate-code - Regenerate invitation code (owner only)
app.post('/api/client/regenerate-code', authenticateToken, async (req, res) => {
  try {
    if (req.user.is_team_member) {
      return res.status(403).json({ error: 'Only business owners can regenerate codes' });
    }

    const newCode = generateInvitationCode();

    await pool.query(
      'UPDATE clients SET invitation_code = $1, invitation_code_created_at = NOW() WHERE id = $2',
      [newCode, req.user.id]
    );

    res.json({
      success: true,
      invitation_code: newCode,
      message: 'Invitation code regenerated successfully'
    });
  } catch (error) {
    console.error('Error regenerating code:', error);
    res.status(500).json({ error: 'Failed to regenerate code' });
  }
});

// Helper function to send email via GHL
async function sendGHLEmail(locationId, toEmail, subject, body) {
  try {
    const ghlApiKey = process.env.GHL_API_KEY;
    if (!ghlApiKey) {
      console.log('❌ GHL API key not configured, skipping email');
      return { success: false, error: 'GHL_API_KEY not configured' };
    }

    console.log(`📧 sendGHLEmail: Sending to ${toEmail} via location ${locationId}`);

    // Find or create contact - pass correct parameters: (locationId, apiKey, contactData)
    const contactId = await findOrCreateGHLContact(locationId, ghlApiKey, {
      email: toEmail,
      name: toEmail.split('@')[0],
      phone: null
    });

    if (!contactId) {
      console.error('❌ Could not find or create GHL contact for', toEmail);
      return { success: false, error: 'Failed to create GHL contact' };
    }

    console.log(`✅ Got GHL contact ID: ${contactId}`);

    // Send email
    const response = await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ghlApiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify({
        type: 'Email',
        contactId: contactId,
        subject: subject,
        html: body.replace(/\n/g, '<br>'),
        emailFrom: 'SaveYa Tech <notifications@saveyatech.com>'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ GHL email send failed:', errorText);
      return { success: false, error: errorText };
    } else {
      const responseData = await response.json();
      console.log(`✅ Email sent successfully to ${toEmail}`, responseData);
      return { success: true, data: responseData };
    }
  } catch (error) {
    console.error('❌ Error sending GHL email:', error);
    return { success: false, error: error.message };
  }
}

// ============ ADMIN ROUTES (for managing clients) ============

// GET /api/admin/clients - List all clients
app.get('/api/admin/clients', authenticateAdminToken, async (req, res) => {
  try {
    // Check if last_login column exists first
    const columnCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'clients' AND column_name = 'last_login'
    `);

    const hasLastLogin = columnCheck.rows.length > 0;

    let result;
    if (hasLastLogin) {
      result = await pool.query(
        'SELECT id, email, business_name, agent_ids, created_at, active, last_login FROM clients ORDER BY created_at DESC'
      );
    } else {
      console.log('Note: last_login column not found, run /api/run-migration');
      result = await pool.query(
        'SELECT id, email, business_name, agent_ids, created_at, active FROM clients ORDER BY created_at DESC'
      );
    }

    res.json({ clients: result.rows });
  } catch (error) {
    console.error('Error fetching clients:', error);
    console.error('Error details:', error.stack);
    res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
  }
});

// POST /api/admin/clients - Create new client account
app.post('/api/admin/clients', authenticateAdminToken, async (req, res) => {
  try {
    const { email, password, business_name, agent_ids } = req.body;

    if (!email || !password || !business_name || !agent_ids) {
      return res.status(400).json({ error: 'All fields required' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert client
    const result = await pool.query(`
      INSERT INTO clients (email, password_hash, business_name, agent_ids)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, business_name, agent_ids, created_at
    `, [email.toLowerCase(), password_hash, business_name, agent_ids]);

    res.json({
      success: true,
      client: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/admin/clients/:id - Update client
app.put('/api/admin/clients/:id', authenticateAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, business_name, agent_ids, active } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email.toLowerCase());
    }
    if (password) {
      const password_hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(password_hash);
    }
    if (business_name !== undefined) {
      updates.push(`business_name = $${paramIndex++}`);
      values.push(business_name);
    }
    if (agent_ids !== undefined) {
      updates.push(`agent_ids = $${paramIndex++}`);
      values.push(agent_ids);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE clients
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, business_name, agent_ids, active, updated_at
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({
      success: true,
      client: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/admin/clients/:id - Delete/deactivate client
app.delete('/api/admin/clients/:id', authenticateAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;

    if (permanent === 'true') {
      // Hard delete - permanently remove from database
      const result = await pool.query(
        'DELETE FROM clients WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      res.json({ success: true, permanent: true });
    } else {
      // Soft delete by setting active = false
      const result = await pool.query(
        'UPDATE clients SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      res.json({ success: true, permanent: false });
    }
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// POST /api/admin/clients/:id/reset-password - Reset client password
app.post('/api/admin/clients/:id/reset-password', authenticateAdminToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Generate a temporary password (12 characters, alphanumeric)
    const temporaryPassword = crypto.randomBytes(8).toString('base64').slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x');

    // Hash the temporary password
    const password_hash = await bcrypt.hash(temporaryPassword, 10);

    // Update client's password
    const result = await pool.query(
      'UPDATE clients SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING email',
      [password_hash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    console.log(`Password reset for client ${result.rows[0].email}`);

    res.json({
      success: true,
      temporary_password: temporaryPassword,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================================
// NOTIFICATION RECIPIENTS ENDPOINTS
// ============================================================================

// GET /api/notification-recipients/:agentId - List all notification recipients for an agent
app.get('/api/notification-recipients/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    const result = await pool.query(`
      SELECT
        nr.id, nr.agent_id, nr.name, nr.email, nr.phone, nr.ghl_contact_id, nr.active,
        nr.created_at, nr.updated_at,
        np.new_lead_email, np.new_lead_sms,
        np.existing_client_email, np.existing_client_sms,
        np.attorney_email, np.attorney_sms,
        np.insurance_email, np.insurance_sms,
        np.medical_email, np.medical_sms,
        np.other_email, np.other_sms
      FROM notification_recipients nr
      LEFT JOIN notification_preferences np ON nr.id = np.recipient_id
      WHERE nr.agent_id = $1
      ORDER BY nr.created_at ASC
    `, [agentId]);

    res.json({ recipients: result.rows });
  } catch (error) {
    console.error('Error fetching notification recipients:', error);
    res.status(500).json({ error: 'Failed to fetch notification recipients' });
  }
});

// POST /api/notification-recipients - Add a new notification recipient
app.post('/api/notification-recipients', async (req, res) => {
  try {
    const { agent_id, name, email, phone } = req.body;

    if (!agent_id || !name || !email) {
      return res.status(400).json({ error: 'agent_id, name, and email are required' });
    }

    // Get client config to get GHL credentials
    const config = getClientConfig(agent_id);
    if (!config) {
      return res.status(400).json({ error: 'No configuration found for this agent' });
    }

    // Find or create GHL contact
    console.log(`\n📝 Adding notification recipient: ${name} (${email})`);
    const ghlContactId = await findOrCreateGHLContact(
      config.ghl_location_id,
      config.ghl_api_key,
      { name, email, phone }
    );

    if (!ghlContactId) {
      return res.status(500).json({ error: 'Failed to create/find GHL contact. Please try again.' });
    }

    // Insert recipient into database
    const recipientResult = await pool.query(`
      INSERT INTO notification_recipients (agent_id, name, email, phone, ghl_contact_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [agent_id, name, email.toLowerCase(), phone || null, ghlContactId]);

    const recipient = recipientResult.rows[0];

    // Create default notification preferences
    await pool.query(`
      INSERT INTO notification_preferences (recipient_id)
      VALUES ($1)
    `, [recipient.id]);

    // Fetch the complete recipient with preferences
    const fullResult = await pool.query(`
      SELECT
        nr.*,
        np.new_lead_email, np.new_lead_sms,
        np.existing_client_email, np.existing_client_sms,
        np.attorney_email, np.attorney_sms,
        np.insurance_email, np.insurance_sms,
        np.medical_email, np.medical_sms,
        np.other_email, np.other_sms
      FROM notification_recipients nr
      LEFT JOIN notification_preferences np ON nr.id = np.recipient_id
      WHERE nr.id = $1
    `, [recipient.id]);

    console.log(`✅ Notification recipient added: ${name} (GHL Contact: ${ghlContactId})`);

    res.json({
      success: true,
      recipient: fullResult.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'This email is already a notification recipient for this agent' });
    }
    console.error('Error adding notification recipient:', error);
    res.status(500).json({ error: 'Failed to add notification recipient' });
  }
});

// PUT /api/notification-recipients/:id - Update a notification recipient
app.put('/api/notification-recipients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, active } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email.toLowerCase());
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone || null);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE notification_recipients
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    res.json({
      success: true,
      recipient: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating notification recipient:', error);
    res.status(500).json({ error: 'Failed to update notification recipient' });
  }
});

// DELETE /api/notification-recipients/:id - Remove a notification recipient
app.delete('/api/notification-recipients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM notification_recipients WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    console.log(`🗑️ Notification recipient removed: ${result.rows[0].name}`);

    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting notification recipient:', error);
    res.status(500).json({ error: 'Failed to delete notification recipient' });
  }
});

// PUT /api/notification-preferences/:recipientId - Update notification preferences
app.put('/api/notification-preferences/:recipientId', async (req, res) => {
  try {
    const { recipientId } = req.params;
    const {
      new_lead_email, new_lead_sms,
      existing_client_email, existing_client_sms,
      attorney_email, attorney_sms,
      insurance_email, insurance_sms,
      medical_email, medical_sms,
      other_email, other_sms
    } = req.body;

    const result = await pool.query(`
      UPDATE notification_preferences
      SET
        new_lead_email = COALESCE($1, new_lead_email),
        new_lead_sms = COALESCE($2, new_lead_sms),
        existing_client_email = COALESCE($3, existing_client_email),
        existing_client_sms = COALESCE($4, existing_client_sms),
        attorney_email = COALESCE($5, attorney_email),
        attorney_sms = COALESCE($6, attorney_sms),
        insurance_email = COALESCE($7, insurance_email),
        insurance_sms = COALESCE($8, insurance_sms),
        medical_email = COALESCE($9, medical_email),
        medical_sms = COALESCE($10, medical_sms),
        other_email = COALESCE($11, other_email),
        other_sms = COALESCE($12, other_sms),
        updated_at = NOW()
      WHERE recipient_id = $13
      RETURNING *
    `, [
      new_lead_email, new_lead_sms,
      existing_client_email, existing_client_sms,
      attorney_email, attorney_sms,
      insurance_email, insurance_sms,
      medical_email, medical_sms,
      other_email, other_sms,
      recipientId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preferences not found for this recipient' });
    }

    res.json({
      success: true,
      preferences: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// ============================================================================
// LEAD TRACKING ENDPOINTS
// ============================================================================

// GET /api/leads/stats/:agentId - Get lead statistics for a specific client
// NOTE: This MUST come before /api/leads/:agentId to avoid route matching issues
app.get('/api/leads/stats/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const stats = await getLeadStats(agentId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({ error: 'Failed to fetch lead stats' });
  }
});

// GET /api/admin/leads/stats - Get lead statistics across all clients (admin only)
app.get('/api/admin/leads/stats', authenticateAdminToken, async (req, res) => {
  try {
    const stats = await getAllLeadStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching all lead stats:', error);
    res.status(500).json({ error: 'Failed to fetch lead stats' });
  }
});

// GET /api/calls/:callId - Get full details for a specific call
app.get('/api/calls/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    // Fetch call from Retell API
    const call = await retellClient.call.retrieve(callId);

    // Get category from database
    const categoryResult = await pool.query(
      'SELECT * FROM call_categories WHERE call_id = $1',
      [callId]
    );

    const category = categoryResult.rows[0] || null;

    res.json({
      ...call,
      category: category?.category || 'Uncategorized',
      reasoning: category?.reasoning || null,
      confidence_score: category?.confidence_score || null
    });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

// GET /api/leads/:agentId - Get all leads for a specific client
// NOTE: This MUST come after more specific routes like /api/leads/stats/:agentId
app.get('/api/leads/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status } = req.query; // Optional filter by status

    const leads = await getLeadsByAgent(agentId, status || null);
    res.json({ leads });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// PUT /api/leads/:leadId/status - Update lead status manually
app.put('/api/leads/:leadId/status', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes, updated_by } = req.body;

    if (!status || !['Pending', 'Approved', 'Denied'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be: Pending, Approved, or Denied'
      });
    }

    const updatedLead = await updateLeadStatus(leadId, status, updated_by, notes);
    res.json({
      success: true,
      lead: updatedLead,
      message: `Lead status updated to ${status}`
    });
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: error.message || 'Failed to update lead status' });
  }
});

// PUT /api/leads/:leadId/contact - Update lead contact information
app.put('/api/leads/:leadId/contact', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { name, email, phone_number } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }

    if (phone_number !== undefined) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phone_number);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'At least one field (name, email, phone_number) must be provided'
      });
    }

    // Always update the updated_at timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(leadId);

    const query = `
      UPDATE leads
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    console.log(`✅ Lead ${leadId} contact info updated`);
    res.json({
      success: true,
      lead: result.rows[0],
      message: 'Contact information updated successfully'
    });
  } catch (error) {
    console.error('Error updating lead contact info:', error);
    res.status(500).json({ error: error.message || 'Failed to update contact information' });
  }
});

// DELETE /api/leads/:leadId - Delete a lead (admin only)
app.delete('/api/leads/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const result = await pool.query(
      'DELETE FROM leads WHERE id = $1 RETURNING *',
      [leadId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    console.log(`✅ Lead ${leadId} deleted: ${result.rows[0].name || result.rows[0].phone_number}`);
    res.json({
      success: true,
      message: 'Lead deleted successfully',
      deleted_lead: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: error.message || 'Failed to delete lead' });
  }
});

// ============================================
// FEEDBACK CHATBOT API
// ============================================

// Store the Maria AI Receptionist prompt for context
const MARIA_PROMPT_SUMMARY = `
Maria is CourtLaw's AI intake specialist with these key behaviors:
- Asks ONE question at a time (CRITICAL rule - never bundles questions)
- Uses 5th grade reading level, simple language
- Slow, clear, methodical pace
- Bilingual (English/Spanish)
- Warm, compassionate tone

CALLER WORKFLOWS:
1. Injured Party: Language → Location check (NJ/NY only) → Get story → Qualify → Collect info → Schedule callback
2. Medical Professional: Get info → Take message (NEVER gives case details)
3. Attorney: Get info → Take message (NEVER gives case details)
4. Other: Take message with full context

CASE TYPES HANDLED:
- Car accidents, Uber/Rideshare, Construction, Motorcycle, Truck/Bus/Taxi, Slip & Fall, Workers' Compensation

KEY GUARDRAILS:
- NEVER provides legal advice or case predictions
- NEVER discusses settlement amounts
- Only handles NJ and NY cases
- Confirms all info (phone, email, names) by spelling back

INFORMATION COLLECTION (one at a time):
1. Full name
2. Phone number (repeat back)
3. Email (spell back)
4. Incident date (specific date required)
5. Location
6. How they heard about CourtLaw
7. Case-specific questions based on type

TECHNICAL BEHAVIORS:
- Uses filler words naturally ("umm", "so")
- Reads phone numbers in groups: "five-five-five... one-two-three..."
- Spells emails: "J O H N - dot - S M I T H - at - gmail - dot - com"
- Handles audio issues gracefully
`;

// Chatbot conversation sessions (in-memory for simplicity)
const chatbotSessions = new Map();

// POST /api/chatbot/message - Handle chatbot messages
app.post('/api/chatbot/message', async (req, res) => {
  try {
    const { message, sessionId, clientName, clientId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message and sessionId are required' });
    }

    // Get or create session
    let session = chatbotSessions.get(sessionId);
    if (!session) {
      // Fetch client's AI receptionist info from database
      let aiReceptionistName = 'AI Receptionist';
      let aiReceptionistPrompt = '';

      if (clientId) {
        const dbClient = await pool.connect();
        try {
          const result = await dbClient.query(
            'SELECT ai_receptionist_name, ai_receptionist_prompt FROM clients WHERE id = $1',
            [clientId]
          );
          if (result.rows.length > 0) {
            aiReceptionistName = result.rows[0].ai_receptionist_name || 'AI Receptionist';
            aiReceptionistPrompt = result.rows[0].ai_receptionist_prompt || '';
          }
        } finally {
          dbClient.release();
        }
      }

      session = {
        messages: [],
        clientName: clientName || 'Client',
        aiReceptionistName,
        aiReceptionistPrompt,
        startedAt: new Date().toISOString(),
        notificationSent: false
      };
      chatbotSessions.set(sessionId, session);

      // Log new conversation (email will be sent when conversation ends/closes)
      console.log(`🤖 New chatbot conversation started by ${clientName || 'Unknown Client'}`);
    }

    // Add user message to history
    session.messages.push({ role: 'user', content: message });

    // Build the system prompt for Claude with dynamic AI receptionist info
    const aiName = session.aiReceptionistName;
    const aiPrompt = session.aiReceptionistPrompt || 'No specific details provided about this AI receptionist.';

    const systemPrompt = `You are a friendly help assistant for SaveYa Tech's client dashboard. Help business owners use their dashboard AND collect feedback about their AI receptionist (${aiName}).

RESPONSE STYLE - CRITICAL:
- MAX 2-3 sentences per response
- Simple words, short sentences (5th grade level)
- One clear answer per question
- Warm but efficient - no fluff
- If they give feedback about ${aiName}, thank them and say you'll pass it to the team

FORMATTING - ALWAYS USE:
- Use **bold** for important words, buttons, or section names
- Use bullet points (•) when listing 2+ items
- ALWAYS use line breaks (hit enter) between different points
- NEVER write a wall of text - split into separate lines
- Put each step or bullet on its OWN LINE
- Add a blank line between sections for readability
- Example format:
  "To approve a lead:

   • Go to **Lead Tracker**
   • Find the lead in **Pending** tab
   • Click the **green checkmark** ✓

   That marks it as a real lead!"

===== COMPLETE APP KNOWLEDGE =====

📊 STAT BOXES (4 boxes at top):
- Total Calls = all calls received
- New Leads = potential customers (MOST IMPORTANT - check daily!)
- Existing Clients = repeat callers
- Other = spam, wrong numbers, sales calls
- CLICK any box to filter the call list to show only that type

📈 CHARTS:
- Left chart = calls per day (last 7 days)
- Right chart = breakdown of call types by percentage

⭐ NEW LEAD BANNER (yellow/orange bar at top):
- Shows newest lead with name, phone, date, and summary
- Green checkmark = APPROVE (real lead)
- Red X = DENY (not a real lead)
- Tap banner to see full call details
- CHECK THIS DAILY so you don't miss business!

📋 LEAD TRACKER:
- Shows: Total Leads, Approved, Denied, Conversion Rate
- 3 tabs: Pending (needs review), Approved, Denied
- Search box to find leads by name, phone, or email
- APPROVE = real potential customer you want to follow up with
- DENY = not a real lead (spam, wrong category, etc.)

📞 RECENT CALLS:
- Shows: phone number, date/time, duration, confidence score, category
- CLICK any call to read the FULL TRANSCRIPT
- Confidence score: Higher % = AI more certain about the category
- Categories: New Lead, Existing Client, Medical, Attorney, Insurance, Other

🔍 FILTERS & SEARCH:
- Quick filters: Today, This Week, This Month
- Date Range: Custom, All Time, Last 7/30/90 Days
- Category dropdown: filter by call type
- Duration dropdown: filter by call length
- Search box: find by phone number
- EXPORT CSV: download calls as spreadsheet
- REFRESH: get latest calls

📄 CALL TRANSCRIPTS:
- Click any call to see the word-for-word conversation
- Shows what the caller said AND what ${aiName} said
- Scroll through to see the full conversation
- Use this to understand what happened on each call

⚙️ SETTINGS (gear icon top-right):
- Account tab: View your email and business name
- Security tab: Change your password
- Team tab: Manage team members (if you're the owner)
- Notifications tab: Set up email alerts

📧 NOTIFICATIONS (in Settings):
- New Lead alerts: Get emailed when a new lead comes in
- Daily summaries: Get a daily report of all calls
- Add multiple email addresses to receive alerts

👥 TEAM (in Settings - owners only):
- Generate invitation code to add team members
- Team members can view calls but can't change settings
- Only the business owner can manage the team

🔑 KEYBOARD SHORTCUTS:
- Press "/" = jump to search
- Press "R" = refresh calls
- Press "E" = export CSV
- Arrow keys = navigate pages

❓ COMMON QUESTIONS:
- "Where are my leads?" → Lead Tracker section, check Pending tab
- "How do I see what was said?" → Click any call to read transcript
- "What does Approve/Deny do?" → Approve confirms real lead, Deny marks as not real
- "How do I find old calls?" → Use filters or search by phone number
- "Why is confidence low?" → Short calls or unclear conversations have lower confidence
- "How do I export data?" → Click EXPORT CSV button above calls

⚠️ TROUBLESHOOTING:
- Page not loading? → Try refreshing (R key or Refresh button)
- Can't see new calls? → Click Refresh button
- Calls showing wrong category? → AI learns over time, just approve/deny leads correctly
- Need to change AI behavior? → Go to Settings > Account to edit AI prompt

===== END APP KNOWLEDGE =====

THE CLIENT'S AI RECEPTIONIST (${aiName}):
${aiPrompt}

HANDLING FEEDBACK:
If they mention problems with ${aiName} (wrong responses, bad behavior, missed info, etc.):
1. Thank them for the feedback
2. Ask ONE follow-up question if needed (what happened? what should it have done?)
3. Say you'll pass it to the SaveYa team
4. Don't try to fix it yourself - just collect the feedback

EXAMPLE RESPONSES (notice clean formatting with line breaks):

User: "How do I approve leads?"
Response:
"To approve a lead:

• Go to **Lead Tracker** section
• Click the **green checkmark** ✓

That marks it as a real potential customer!"

User: "How do I see what was said on a call?"
Response:
"Click any call in **Recent Calls** to see the full transcript.

You'll see exactly what the caller said and how ${aiName} responded."

User: "Maria talks too fast"
Response:
"Thanks for that feedback about ${aiName}!

I'll make sure our team sees this. Was there a specific call where this happened?"

User: "How do I find old calls?"
Response:
"You can filter calls by:

• **Date Range** dropdown
• **Search box** (phone number)
• **Category** dropdown"

REMEMBER: Short. Clear. Helpful. **Well-formatted**. One answer at a time.`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,  // Keep responses short
      system: systemPrompt,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to history
    session.messages.push({ role: 'assistant', content: assistantMessage });

    // Keep only last 20 messages to prevent token overflow
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    res.json({
      success: true,
      message: assistantMessage,
      sessionId
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: "I'm having trouble right now. Please try again in a moment."
    });
  }
});

// POST /api/chatbot/end - End conversation and generate recommendations
app.post('/api/chatbot/end', async (req, res) => {
  try {
    const { sessionId, clientName } = req.body;

    const session = chatbotSessions.get(sessionId);
    if (!session || session.messages.length === 0) {
      return res.json({ success: true, message: 'No conversation to analyze' });
    }

    // Use session's dynamic AI receptionist info
    const aiName = session.aiReceptionistName || 'AI Receptionist';
    const aiPrompt = session.aiReceptionistPrompt || 'No specific prompt details available.';

    // Generate recommendations using Claude
    const conversationText = session.messages
      .map(m => `${m.role === 'user' ? 'Client' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const analysisPrompt = `Summarize this chatbot feedback conversation in 2-3 bullet points of what action I need to take. Be brief and direct.

CONVERSATION:
${conversationText}

Reply with ONLY a short bullet list like:
• [Action 1]
• [Action 2]

No headers, no explanations - just the action items.`;

    const analysisResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    const recommendations = analysisResponse.content[0].text;

    // Send detailed notification with recommendations
    await sendChatbotRecommendations(clientName || session.clientName, conversationText, recommendations);

    // Clean up session
    chatbotSessions.delete(sessionId);

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      recommendations
    });

  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to process feedback' });
  }
});

// Helper: Send recommendations when conversation ends
async function sendChatbotRecommendations(clientName, conversation, recommendations) {
  console.log(`\n🎯 CHATBOT FEEDBACK RECOMMENDATIONS`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Client: ${clientName}`);
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log(`\n📝 CONVERSATION:`);
  console.log(conversation);
  console.log(`\n💡 RECOMMENDATIONS:`);
  console.log(recommendations);
  console.log(`═══════════════════════════════════════\n`);

  // Send email notification with full summary to chris@saveyatech.com
  try {
    // Get CourtLaw's GHL location ID for sending
    const result = await pool.query(
      "SELECT ghl_location_id FROM clients WHERE business_name = 'CourtLaw Injury Lawyers' LIMIT 1"
    );
    const locationId = result.rows[0]?.ghl_location_id;

    if (locationId) {
      const subject = `Chatbot Feedback - ${clientName}`;
      const body = `Client: ${clientName}
Time: ${new Date().toLocaleString()}

ACTION NEEDED:
${recommendations}

─────────────────────────
FULL CONVERSATION:

${conversation}`;

      await sendEmail('chris@saveyatech.com', subject, body);
      console.log('✅ Chatbot summary email sent to chris@saveyatech.com');
    }
  } catch (error) {
    console.error('Failed to send chatbot summary email:', error.message);
  }
}

// Railway will set PORT for us
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy listening on ${PORT}`));
