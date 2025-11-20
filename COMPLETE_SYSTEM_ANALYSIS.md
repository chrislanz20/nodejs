# Complete System Analysis & Architecture Documentation
**Date:** November 20, 2025
**Analyst:** Claude (Sonnet 4.5)
**Status:** PRODUCTION SYSTEM - ANALYSIS COMPLETE

---

## 🎯 EXECUTIVE SUMMARY

Your Node.js application is a **multi-tenant voice AI call management platform** that:
- Processes Retell AI voice agent calls
- Uses Claude AI for intelligent call categorization
- Tracks leads and conversions automatically
- Sends notifications via GoHighLevel (email + SMS)
- Provides dual dashboards (admin + client-facing)
- Stores everything in PostgreSQL

**Key Finding:** Your current system already does 95% of what N8N does, but with a DIFFERENT architecture approach.

---

## 📊 DATABASE SCHEMA

### Tables Overview

#### 1. **call_categories**
Stores AI-categorized calls
```sql
- call_id (PK) - Retell call ID
- category - New Lead, Existing Client, Attorney, Medical, Insurance, Other
- reasoning - Why Claude chose this category
- manual - Was it manually categorized?
- auto - Was it auto-categorized by Claude?
- created_at, updated_at
```

#### 2. **clients**
Multi-tenant client accounts (admin users)
```sql
- id (PK)
- email (unique)
- password_hash
- business_name
- agent_ids (array) - Which Retell agents they own
- active (boolean)
- last_login
- created_at, updated_at
```

#### 3. **team_members**
Client dashboard users (for each client)
```sql
- id (PK)
- client_id (FK → clients)
- email
- password_hash
- name
- role (Admin, Sales, Support, Viewer)
- active
- last_login
- created_at, updated_at
```

#### 4. **leads**
New lead tracking with conversion detection
```sql
- id (PK)
- call_id
- agent_id
- phone_number (indexed)
- name, email
- incident_description
- incident_date, incident_location
- category
- status (Pending, Approved, Denied, In Progress)
- conversion_detected (boolean)
- conversion_call_id
- first_call_date, last_call_date
- status_updated_at, status_updated_by
- notes
- created_at, updated_at
```

#### 5. **activity_log**
Audit trail for team member actions
```sql
- id (PK)
- team_member_id (FK)
- client_id (FK)
- action
- call_id
- details (JSONB)
- created_at
```

---

## 🏗️ SYSTEM ARCHITECTURE

### Current Call Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CALL HAPPENS                                             │
│    Retell AI receives call → agent processes → call ends    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. WEBHOOK TRIGGER                                          │
│    POST /webhook/retell-call-ended                          │
│    • Responds immediately (200 OK)                          │
│    • Processes async (1 second delay)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. FETCH CALL DATA                                          │
│    retellClient.call.retrieve(callId)                       │
│    • Gets full transcript                                   │
│    • Gets phone number, duration, cost                      │
│    • Gets extracted_data from Retell                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CLAUDE AI CATEGORIZATION                                 │
│    categorizeTranscript(transcript, phoneNumber)            │
│    • Analyzes entire transcript                             │
│    • Checks if phone called before                          │
│    • Returns: category, reasoning, confidence               │
│    • Categories: New Lead, Existing Client, Attorney,       │
│                  Medical, Insurance, Other                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SAVE CATEGORY TO DB                                      │
│    writeCategories() → call_categories table                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. EXTRACT LEAD DATA (if New Lead)                          │
│    extractLeadDataFromTranscript()                          │
│    • Claude Haiku extracts: email, name, incident_date,     │
│      incident_location, incident_description                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. TRACK LEAD & DETECT CONVERSIONS                          │
│    trackLead(callId, agentId, category, callData)           │
│    • Check if phone number called before                    │
│    • If New Lead → save to leads table (status: Pending)    │
│    • If New Lead→Existing Client → CONVERSION! (Auto-approve)│
│    • Update first_call_date, last_call_date                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. SEND NOTIFICATIONS                                       │
│    sendNotifications(agentId, category, callData)           │
│    • Get client config by agentId                           │
│    • Generate email template (Attorney/Medical/Other/Lead)  │
│    • Send emails via GoHighLevel API                        │
│    • Send SMS via GoHighLevel API (New Leads only)          │
└─────────────────────────────────────────────────────────────┘
```

### Notification System

**GoHighLevel Integration** (`lib/ghlNotifications.js`):
- Sends emails using GHL Conversations API
- Sends SMS using GHL Conversations API
- Configured per client (agent_id based)
- Mode: test or production
- Test mode: only sends to Chris (17lanzch@gmail.com, +17814757191)
- Production mode: 9 email recipients, 3 SMS recipients

**Email Templates** (`lib/emailTemplates.js`):
- 5 templates: Attorney, Medical, Other, New Lead, Existing Client
- Uses N8N-style variable replacement
- Loads raw HTML from `/templates/` directory
- Professional formatting with CTA buttons

**Client Configuration** (`config/clients.js`):
- CourtLaw: agent_8e50b96f7e7bb7ce7479219fcc
- GHL Location: lneM3M1j3P5i0JYeNK18
- Currently in TEST mode

---

## 🔄 N8N WORKFLOW vs CURRENT SYSTEM

### N8N Approach (TO BE ELIMINATED)

**Timing:** DURING call (real-time)
**Webhooks:** 4 separate endpoints
**Data Source:** Retell function tools
**Processing:** N8N workflows
**Notifications:** Gmail (deprecated) + GHL SMS
**Storage:** Google Sheets (deprecated)

```
Retell Function Tools Fire → N8N Webhooks
  ├─ capture_attorney_data
  ├─ CaseLaw_MedPro_data_capture
  ├─ CaseLaw_Other_data_capture
  └─ CaseLaw_capture_New_Lead_data
           ↓
N8N Routes by Type → Sends Gmail → Triggers GHL SMS
```

### Current System Approach

**Timing:** AFTER call ends
**Webhooks:** 1 endpoint (`/webhook/retell-call-ended`)
**Data Source:** Full transcript + Retell extracted_data
**Processing:** Claude AI categorization
**Notifications:** GHL Email + SMS (all via API)
**Storage:** PostgreSQL

```
Retell Call Ends → /webhook/retell-call-ended
           ↓
Fetch Full Call Data → Claude Categorizes
           ↓
Save to PostgreSQL → Track Leads → Send Notifications (GHL)
```

---

## 🎨 DASHBOARD FEATURES

### Admin Dashboard
**URL:** https://nodejs-admqgjtl1-chris-lanzillis-projects.vercel.app/

**Features:**
- Overview: Total agents (12), Total calls (1,590), Duration (2863:59 min), Cost ($610.56)
- Recent calls table (50 most recent)
- Call categorization with visual badges
- Export/Import functionality
- Client Management tab
  - Add/edit/delete clients
  - View client statistics
  - Manage agent assignments
  - Track revenue per client

### Client Dashboard
**URL:** https://nodejs-theta-woad.vercel.app/client-dashboard
**Example Client:** COURTLAW INJURY LAWYERS

**Features:**
- **Statistics:**
  - Total Calls: 1,439
  - New Leads: 94
  - Existing Clients: 156
  - Other Calls: 1,189

- **Charts:**
  - Calls over time (last 7 days) - bar chart
  - Category distribution - pie chart

- **Lead Tracker:**
  - Pending leads (3)
  - Approve/Deny actions
  - Conversion tracking
  - Shows: name, phone, email, first call date

- **Recent Calls:**
  - Filterable by date range, category, duration
  - Search by phone/name/email
  - Shows confidence indicators
  - Export to CSV
  - Pagination (25 per page)

---

## ⚠️ CRITICAL QUESTIONS TO ANSWER

### 1. **Where are Retell function tools pointing?**

**Current State Unknown:**
- Are function tools still pointing to N8N webhooks?
- OR are they disabled/not configured?
- OR are they pointing to your Node.js endpoints?

**This is critical because:**
- If pointing to N8N → notifications sent TWICE (N8N + Node.js)
- If disabled → Node.js is the ONLY notification system
- If pointing to Node.js → need different endpoints than `/webhook/retell-call-ended`

### 2. **Do you want real-time notifications?**

**N8N:** Sends notifications DURING calls (when function tool fires)
**Current System:** Sends notifications AFTER calls end

**Trade-offs:**
- Real-time = faster alerts, but requires function tools
- Post-call = more accurate (full transcript), simpler architecture

### 3. **Are N8N notifications currently active?**

**Check:**
- Look at recent email receipts - are you getting emails from both systems?
- Check N8N workflow activity logs
- Check Node.js server logs for notification sends

---

## ✅ WHAT YOU ALREADY HAVE WORKING

1. ✅ **PostgreSQL** - Source of truth for all data
2. ✅ **GoHighLevel Integration** - Email + SMS via API
3. ✅ **Lead Tracking** - Automatic with conversion detection
4. ✅ **Email Templates** - All 5 types (Attorney, Medical, Other, New Lead, Existing Client)
5. ✅ **Claude AI Categorization** - Intelligent, context-aware
6. ✅ **Dual Dashboards** - Admin + Client portals
7. ✅ **Multi-tenant** - Supports multiple clients
8. ✅ **Authentication** - JWT-based for APIs
9. ✅ **Call Analytics** - Cost tracking, duration, categorization
10. ✅ **Conversion Detection** - Automatic lead→client detection

---

## 🚀 RECOMMENDATIONS

### Option A: Keep Current System (Recommended)

**If Retell function tools are NOT active:**

✅ **Keep everything as-is**
✅ **Just turn off N8N subscription** ($20/month savings)
✅ **Switch client config from test → production mode**

**Why:**
- Your system is MORE sophisticated than N8N
- Claude categorization is better than Retell function tools
- Lead tracking + conversion detection (N8N doesn't have this)
- All data in PostgreSQL (not Google Sheets)
- GHL for both email AND SMS (not Gmail + GHL)

**Action Items:**
1. Verify N8N is not sending duplicate notifications
2. Switch `config/clients.js` mode from 'test' to 'production'
3. Add production GHL contact IDs to config
4. Cancel N8N subscription
5. Keep N8N workflow export as documentation

---

### Option B: Add Function Tool Webhooks (If Needed)

**If you want real-time notifications (DURING calls):**

Create 4 new webhook endpoints:
- `/webhook/capture-attorney`
- `/webhook/capture-medical`
- `/webhook/capture-other`
- `/webhook/capture-new-lead`

Each would:
1. Receive structured data from Retell function tool
2. Save to database immediately
3. Send notifications via GHL
4. Skip Claude categorization (already categorized by which tool fired)

**Trade-offs:**
- ✅ Faster notifications (real-time)
- ❌ Less accurate (function tools can miscategorize)
- ❌ No transcript analysis
- ❌ More complex architecture

---

## 🔍 WHAT TO CHECK NEXT

**I need you to answer these questions:**

1. **Go to Retell dashboard** → Find agent_8e50b96f7e7bb7ce7479219fcc
   - Are function tools configured with webhook URLs?
   - If yes, what URLs? (N8N or your Node.js app?)

2. **Check recent emails** (from last 24 hours)
   - Are you receiving emails for calls?
   - From what system? (N8N Gmail or GHL?)
   - Are you getting duplicates?

3. **Check N8N dashboard**
   - Are workflows still running?
   - When was last execution?

4. **Your preference:**
   - Do you want notifications DURING calls (real-time) or AFTER calls (more accurate)?
   - Are you okay with the current notification timing?

---

## 📋 FINAL ASSESSMENT

**System Status:** ✅ PRODUCTION READY
**N8N Dependency:** ⚠️ UNCLEAR (needs verification)
**Notification System:** ✅ FULLY IMPLEMENTED
**Lead Tracking:** ✅ ADVANCED (better than N8N)
**Multi-tenant:** ✅ SUPPORTED
**Dashboards:** ✅ FULLY FUNCTIONAL

**Bottom Line:**
Your Node.js app is MORE capable than N8N. The question is not "how do we replace N8N" but rather "is N8N still running and do we need to turn it off?"

---

**Next Step:** Please provide answers to the "WHAT TO CHECK NEXT" section so I can give you exact instructions on how to proceed safely.
