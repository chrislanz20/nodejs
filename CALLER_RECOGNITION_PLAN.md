# CALLER RECOGNITION SYSTEM - IMPLEMENTATION PLAN

**Created:** December 13, 2024
**Status:** Planning Phase
**Goal:** Build bulletproof caller recognition so Maria only asks for missing information

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [Current State](#current-state)
3. [Required Data Fields by Caller Type](#required-data-fields-by-caller-type)
4. [Database Schema](#database-schema)
5. [How It Works (Data Flow)](#how-it-works-data-flow)
6. [Implementation Tasks](#implementation-tasks)
7. [Edge Cases & Handling](#edge-cases--handling)
8. [Backfill Strategy](#backfill-strategy)
9. [Testing Checklist](#testing-checklist)

---

## OVERVIEW

### The Problem
- Maria asks ALL questions every call, even for known callers
- Professional callers (attorneys, medical, insurance) hate repeating info
- People hang up because calls take too long
- Database exists but isn't being populated or used properly

### The Solution
- Recognize callers by phone number BEFORE the call starts
- Send Maria ONLY the questions she needs to ask (missing fields)
- Save ALL caller data after every call
- Backfill historical calls to populate database immediately

---

## CURRENT STATE

### What's Working
- `/webhook/retell-inbound` - Looks up callers when phone rings ✅
- `callerCRM.js` - Has all the functions we need ✅
- `organizations` table - Exists ✅
- `organization_contacts` table - Exists ✅
- `callers` table - Exists ✅
- `caller_details` table - Exists (versioned fields) ✅
- Dynamic variables sent to Maria ✅

### What's Broken
- `getOrCreateOrganizationContact()` is NEVER CALLED in server.js
- Organization contacts aren't saved after calls
- Caller data for New Leads/Existing Clients not consistently saved
- Maria doesn't have instructions on HOW to use the dynamic variables

---

## REQUIRED DATA FIELDS BY CALLER TYPE

### Attorney Calls
| Field | Email Label | Required | Ask If Missing |
|-------|-------------|----------|----------------|
| Caller Name | "Name" | YES | YES |
| Callback Phone | "Verbally Stated Phone" | YES | YES |
| Email | "Email" | YES | YES |
| Organization | "Who Representing" | YES | YES |
| Client Name | "Case Name" | YES | YES |
| Claim Number | "Claim Number" | YES | YES |

### Medical Calls
| Field | Email Label | Required | Ask If Missing |
|-------|-------------|----------|----------------|
| Caller Name | "Name" | YES | YES |
| Callback Phone | "Verbally Stated Phone" | YES | YES |
| Email | "Email" | YES | YES |
| Organization | "representing_who" | YES | YES |
| Patient Name | "client_name" | YES | YES |
| Claim Number | "Claim" | YES | YES |

### Insurance Calls
| Field | Email Label | Required | Ask If Missing |
|-------|-------------|----------|----------------|
| Caller Name | "Name" | YES | YES |
| Callback Phone | "Verbally Stated Phone" | YES | YES |
| Email | "Email" | YES | YES |
| Organization | "representing_who" | YES | YES |
| Claimant Name | "client_name" | YES | YES |
| Claim Number | "Claim" | **CRITICAL** | YES |

### Existing Client Calls
| Field | Email Label | Required | Ask If Missing |
|-------|-------------|----------|----------------|
| Name | "Name" | YES | Confirm only |
| Callback Phone | "Verbally Stated Phone" | YES | Confirm only |
| Email | "Email" | YES | YES if missing |
| Claim Number | "Claim Number" | **CRITICAL** | YES if missing |

### New Lead Calls
| Field | Email Label | Required | Ask If Missing |
|-------|-------------|----------|----------------|
| Name | "Name" | YES | YES |
| Callback Phone | "Verbally Stated Phone" | YES | YES |
| Email | "Email" | YES | YES |
| Incident Description | "What Happened" | YES | YES |
| Case Type | "Case Type" | YES | YES |
| Incident Date | "Date of Incident" | YES | YES |
| Incident Location | "Location" | YES | YES |
| Case-Specific Fields | varies | YES | YES |

---

## DATABASE SCHEMA

### Existing Tables (Keep & Use)
```
organizations
├── id
├── agent_id (multi-tenant scoping)
├── name
├── type (law_firm, insurance, medical_office)
├── primary_phone
├── additional_phones[]
├── total_calls
└── timestamps

organization_contacts
├── id
├── organization_id → organizations.id
├── name
├── email
├── direct_phone
├── fax
├── total_calls
└── timestamps

callers
├── id
├── phone_number
├── agent_id (multi-tenant scoping)
├── caller_type
├── organization_id → organizations.id (for professional callers)
├── total_calls
└── timestamps

caller_details (versioned fields - never overwrites)
├── id
├── caller_id → callers.id
├── field_name (name, email, claim_num, etc.)
├── field_value
├── source_call_id
├── valid_from / valid_until (for history)
└── timestamps
```

### NEW TABLE: contact_client_associations
Tracks which clients each organization contact calls about:
```sql
CREATE TABLE contact_client_associations (
  id SERIAL PRIMARY KEY,
  organization_contact_id INTEGER REFERENCES organization_contacts(id) ON DELETE CASCADE,
  client_name VARCHAR(255) NOT NULL,
  claim_number VARCHAR(50),
  lead_id INTEGER REFERENCES leads(id),
  first_mentioned_call_id VARCHAR(255),
  last_mentioned_call_id VARCHAR(255),
  mention_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_contact_id, LOWER(client_name))
);

CREATE INDEX idx_cca_contact ON contact_client_associations(organization_contact_id);
CREATE INDEX idx_cca_client_name ON contact_client_associations(client_name);
CREATE INDEX idx_cca_claim ON contact_client_associations(claim_number);
```

### Tables/Data to Clean Up
- Review for any orphaned records
- Remove test data if any exists
- Ensure indexes are optimized

---

## HOW IT WORKS (DATA FLOW)

### Step 1: Phone Rings (Inbound Webhook)
```
Phone rings → Retell calls /webhook/retell-inbound
                    ↓
           Look up phone number in database
                    ↓
        ┌─────────────────────────────────────┐
        │  Found organization?                │
        │  → Get org name, known contacts     │
        │                                     │
        │  Found individual caller?           │
        │  → Get name, email, claim #, etc.   │
        │                                     │
        │  Calculate missing fields           │
        └─────────────────────────────────────┘
                    ↓
           Send dynamic_variables to Maria:
           - is_known_caller: true/false
           - caller_name: "John Smith"
           - caller_email: "john@example.com"
           - organization_name: "Progressive Insurance"
           - known_contacts: "John Smith, Sarah Jones"
           - fields_to_confirm: "name: John Smith"
           - fields_to_ask: "claim_number"  ← ONLY missing fields
           - has_organization: true/false
           - profile_complete: true/false
```

### Step 2: Maria Handles Call
Based on dynamic_variables, Maria knows:
- WHETHER this is a known caller (number in system)
- WHAT info we already have
- WHAT info is missing

**Example - Known Caller, Quick Message:**
> Maria: "Hi, this is Maria from CourtLaw. It looks like we have your number
>         in our system. Can you confirm who you are and why you're calling?"
> Caller: "Yeah it's John from Progressive, just letting you know we sent the records."
> Maria: "Got it, I'll pass that along. Anything else?"
> Caller: "Nope, that's it."
> Maria: "Great, have a good day!"
> **→ Quick call. No re-intake needed. Log and notify.**

**Example - Known Caller, Needs Follow-up:**
> Maria: "Hi, this is Maria from CourtLaw. It looks like we have your number
>         in our system. Can you confirm who you are and why you're calling?"
> Caller: "This is John from Progressive, I need to schedule a deposition."
> Maria: "Sure, can you spell your last name for me?"
> Maria: "Which client is this regarding?"
> Maria: "Do you have the claim number for this file?"
> Maria: "Has anything changed we should update - phone, email, anything?"
> **→ Collect missing info. Ask about changes.**

**Example - Known Client, 45+ Days:**
> Maria: [Same natural greeting]
> Caller: "Yeah it's Maria Rodriguez, I have a question about my case."
> Maria: "Can you confirm your claim number is still CLM-12345?"
> Maria: "Has anything changed - phone number, email?"
> **→ Quick verification, then help them.**

**Example - Wrong Person on Known Number:**
> Maria: "Hi, this is Maria from CourtLaw. It looks like we have your number..."
> Caller: "No, I'm not in your system, first time calling."
> Maria: "No problem! Let me get some information from you..."
> **→ Switch to full intake (FLOW 1)**

**Example - Unknown Caller:**
> Normal full intake (current behavior, no changes)

### Step 3: Call Ends (Call-Ended Webhook)
```
Call ends → Retell calls /webhook/retell-call-ended
                    ↓
           Categorize call (Claude Opus)
                    ↓
           Extract data from transcript
                    ↓
        ┌─────────────────────────────────────┐
        │  If Attorney/Medical/Insurance:     │
        │  → getOrCreateOrganization()        │
        │  → getOrCreateOrganizationContact() │
        │  → Save client association          │
        │                                     │
        │  If Existing Client/New Lead:       │
        │  → getOrCreateCaller()              │
        │  → updateCallerFromCallData()       │
        │  → trackLead() if new lead          │
        └─────────────────────────────────────┘
                    ↓
           Send notifications (email/SMS)
```

---

## IMPLEMENTATION TASKS

### Phase 1: Database Setup
- [ ] Create `contact_client_associations` table
- [ ] Add any missing indexes
- [ ] Clean up any test/orphaned data
- [ ] Verify all existing tables have correct structure

### Phase 2: Post-Call Data Saving
- [ ] Update `/webhook/retell-call-ended` to save organization contacts
- [ ] Update webhook to save client associations (who they called about)
- [ ] Update webhook to save caller data for all call types
- [ ] Ensure claim numbers are captured and stored

### Phase 3: Inbound Webhook Enhancement
- [ ] Enhance `getCallerContext()` to return all needed fields
- [ ] Enhance `getOrganizationContext()` to return client history
- [ ] Add `profile_complete` flag to response
- [ ] Add `missing_fields` list to response
- [ ] Test all dynamic variables are sent correctly

### Phase 4: Maria Prompt Updates
- [ ] Add organization caller handling instructions
- [ ] Add "only ask missing fields" logic
- [ ] Add spelling confirmation behavior
- [ ] Add 45-day re-verification prompts
- [ ] Test in Retell dashboard

### Phase 5: Backfill Historical Data
- [ ] Create backfill script
- [ ] Process Attorney/Medical/Insurance calls → populate org contacts
- [ ] Process Existing Client calls → populate caller profiles
- [ ] Process New Lead calls → verify lead data complete
- [ ] Run in batches using Claude Code agent

### Phase 6: Testing
- [ ] Test new caller from unknown number
- [ ] Test known caller with complete profile
- [ ] Test known caller with missing claim number
- [ ] Test known organization, new person calling
- [ ] Test known organization, known person, new client
- [ ] Test name mismatch scenario
- [ ] Test 45-day re-verification trigger

---

## EDGE CASES & HANDLING

### Professional Callers (Attorney/Medical/Insurance)

| Scenario | Maria's Action | Database Action |
|----------|----------------|-----------------|
| Known org, unknown person | "Is this [org] calling?" → "Who am I speaking with?" | Create new contact |
| Known org, known person | "Is this [name] from [org]?" → "Which client today?" | Update last_call_date |
| Known org, known person, known client | "Is this [name] from [org]?" → "Calling about [client]?" | Just log interaction |
| New org entirely | Full intake questions (FLOW 1) | Create org + contact |
| Person says wrong name | "No problem, who am I speaking with?" → normal flow | Create new contact |
| Same person, new client | "Is this about [known client] or someone new?" | Add client association |

### Existing Clients

| Scenario | Maria's Action | Database Action |
|----------|----------------|-----------------|
| Known client, complete profile | "Is this [name]?" → "How can I help today?" | Log interaction |
| Known client, missing claim # | "Is this [name]?" → "Do you have your claim number?" | Update when provided |
| Known client, missing email | "Is this [name]?" → "What's the best email for you?" | Update when provided |
| Family member on client's phone | "Is this [name]?" → "No problem, who am I speaking with?" | Note: spoke with family |
| Client has new incident | "Is this about your existing case or something new?" | Create new lead, link caller |

### Name Verification

| Scenario | Maria's Action | Database Action |
|----------|----------------|-----------------|
| Spelling confirmation | Always spell back: "That's J-O-H-N?" | N/A |
| Caller confirms spelling | Proceed normally | Store as spelled |
| Caller corrects spelling | "Let me fix that" | Update record |
| Name doesn't match stored | "I have [stored], is that correct?" | Update if needed |

### 45-Day Re-Verification
After 45 days since last call, Maria confirms ONE key piece of info:
- "Can you confirm your claim number is still [claim_number]?"

That's it. Don't re-ask name, phone, email - just confirm the claim number.
If they say it's different, update the record. If they don't have one, ask for it.

---

## BACKFILL STRATEGY

### The Smart Extraction Approach
**Key Principle:** We'd rather have MISSING data than WRONG data.

Only extract information that was:
1. Explicitly stated by the caller, AND
2. Confirmed/repeated back by Maria, OR spelled out letter by letter

### Confidence Levels

**HIGH CONFIDENCE → SAVE:**
| Data | How We Know It's Good |
|------|----------------------|
| Name | Maria spelled it back letter by letter, caller confirmed |
| Email | Spelled out ("J-O-H-N at gmail dot com") |
| Phone | Maria repeated back digit by digit, caller confirmed |
| Claim number | Stated and confirmed/repeated |
| Organization | Caller explicitly said "I'm calling from [company]" |
| Client name | Caller stated and Maria confirmed spelling |

**LOW CONFIDENCE → DON'T SAVE:**
| Data | Why It's Risky |
|------|----------------|
| Name mentioned once, never confirmed | Could be misheard |
| Email said fast, not spelled out | Likely has errors |
| Phone said once, not repeated back | Could be wrong digit |
| Anything from garbled transcript | Transcript error |
| Assumed/inferred data | Not from caller's words |

### Extraction Prompt Template
```
Analyze this call transcript. Extract ONLY information that was:
1. Explicitly stated by the caller
2. AND either confirmed/repeated by Maria OR spelled out letter by letter

For each field, only include if HIGH CONFIDENCE.
If uncertain, leave blank - we'd rather ask again than have wrong data.

The caller's own words are the source of truth.
```

### Using Claude Code Agent
- Process historical calls in batches of 50-100
- Use Claude (not cheaper models) for accuracy
- Run as AI agent through the app
- Resume capability if interrupted
- Validate extraction quality before bulk insert

### Data to Extract Per Call Type

**Attorney/Medical/Insurance:**
- Caller name (if spelled/confirmed)
- Caller email (if spelled out)
- Organization name (if stated)
- Which client they called about (if spelled)
- Claim number (if stated and confirmed)

**Existing Client:**
- Name (if confirmed)
- Email (if spelled out)
- Claim number (if stated)

**New Lead:**
- Verify lead record is complete
- Fill in any gaps from transcript (only high-confidence data)

### Estimated Scope
- ~2000 total calls
- ~600-800 professional calls (Attorney/Medical/Insurance)
- ~400-600 existing client calls
- ~400-600 new lead calls

### Validation Step
After backfill, spot-check 10-20 records:
- Did names extract correctly?
- Are emails valid format?
- Do claim numbers look real?
- Any obvious hallucinations?

Only proceed if validation passes.

---

## TESTING CHECKLIST

Before going live, test EVERY scenario:

### New Callers
- [ ] Brand new caller, unknown number → Full intake
- [ ] New caller from known organization number → Ask who's calling

### Professional Callers (Returning)
- [ ] Known attorney, known client → Quick greeting, get purpose
- [ ] Known attorney, new client → Ask which client
- [ ] Known medical, missing email → Ask for email only
- [ ] Known insurance, missing claim # → Ask for claim only

### Existing Clients (Returning)
- [ ] Known client, complete profile → Greeting only
- [ ] Known client, missing claim # → Ask for claim
- [ ] Known client, 46+ days since last call → Re-verify contact info

### Edge Cases
- [ ] Different person on known number → Handle gracefully
- [ ] Name spelling correction → Update database
- [ ] Client provides new claim number → Ask if new or correction
- [ ] Transcript is garbled → Don't save bad data

---

## NOTES

- **Claim numbers are CRITICAL** - Law firm needs these
- **45 days** for periodic re-verification (not 30)
- **Spelling confirmation** is mandatory - Maria must spell back names
- **Clean database** - No orphaned or test data
- **Claude Code for backfill** - Not cheaper models, accuracy matters
- **All caller types** get backfilled, not just professional

---

## MARIA'S TWO CONVERSATION FLOWS

**STATUS:** Maria's prompt currently does NOT use caller recognition variables.
**VERIFIED:** December 13, 2024 - Checked "CourtLaw Dec" agent in Retell dashboard.

### The Simple Approach: Two Flows

Instead of complex conditional logic, Maria has TWO main flows:

| Flow | When to Use | Result |
|------|-------------|--------|
| **FLOW 1: Unknown** | `is_known_caller` = false | Full intake (current behavior) |
| **FLOW 2: Known** | `is_known_caller` = true | Confirm identity → Fast track |

---

### FLOW 1: UNKNOWN CALLER (No Changes Needed)
This is what Maria does now. Full intake for each caller type.

---

### FLOW 2: KNOWN CALLER (New Logic)

**Key Principle:** Get the PURPOSE first. Don't make them repeat info if they just have a quick message.

#### The Natural Greeting (All Known Callers):
```
Maria: "Hi, this is Maria from CourtLaw. It looks like we have your
        number in our system. Can you just confirm who you are and
        why you're calling?"
```

This is natural and human. Gets identity + purpose in one question.

#### After They Respond - Branch Based on PURPOSE:

**IF QUICK MESSAGE / UPDATE:**
```
Caller: "Yeah this is John from Progressive, just wanted to let you
         know we sent the documents."

Maria: "Got it, I'll pass that along to the team. Is there anything
        else I can help you with?"

→ Log it, send notification, DONE.
→ No need to re-ask phone, email, claim number, etc.
```

**IF SUBSTANTIVE (needs follow-up or missing info):**
```
Caller: "This is John from Progressive, I need to schedule a deposition."

Maria: "Sure, can you spell your last name for me?"
       "Which client is this regarding?"
       "Do you have the claim number for this file?"
       "Has anything changed that we should update - your phone, email,
        anything like that?"

→ Collect missing info
→ Ask about changes (not re-ask everything)
```

**IF WRONG PERSON / NEW CALLER:**
```
Caller: "No, I'm not in your system, this is my first time calling."

Maria: "No problem! Let me get some information from you..."

→ Switch to FLOW 1 (full intake)
```

#### For 45+ Days Since Last Call:
```
Maria: [Same natural greeting]

After they confirm identity:
"Can you confirm your claim number is still [claim_number]?"
"Has anything changed - phone number, email, anything like that?"

→ Quick verification, not full re-intake
```

#### The Key Difference:
**OLD:** Ask all questions regardless of why they called
**NEW:** Ask WHY first, then only collect what's actually needed

---

### Dynamic Variables Maria Will Use

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `is_known_caller` | Triggers FLOW 2 | `true` / `false` |
| `caller_name` | For identity confirmation | `"John Smith"` |
| `organization_name` | For org callers | `"Progressive Insurance"` |
| `caller_type` | Professional vs client | `"insurance"` / `"existing_client"` |
| `fields_to_ask` | Missing data to collect | `"claim_number"` |
| `days_since_last_call` | Triggers 45-day rule | `47` |
| `claim_number` | For re-verification | `"CLM-12345"` |

---

### Sample Maria Prompt Addition (Phase 4)

```
## CALLER RECOGNITION LOGIC

{{#if is_known_caller}}
  ## KNOWN CALLER FLOW

  GREETING: "Hi, this is Maria from CourtLaw. It looks like we have your
  number in our system. Can you just confirm who you are and why you're calling?"

  LISTEN to their response. They will tell you:
  1. Who they are (name, maybe organization)
  2. Why they're calling (the purpose)

  BRANCH BASED ON PURPOSE:

  **IF QUICK MESSAGE/UPDATE** (e.g., "just wanted to let you know...", "quick update"):
    - Acknowledge: "Got it, I'll pass that along to the team."
    - Ask: "Is there anything else I can help with?"
    - If no → end call. DO NOT re-ask phone, email, claim number.
    - Log the message and send notification.

  **IF SUBSTANTIVE** (needs follow-up, scheduling, questions):
    - "Can you spell your last name for me?"
    - If professional: "Which client is this regarding?"
    - If we're missing claim number: "Do you have the claim number for this file?"
    - "Has anything changed that we should update - phone, email, anything like that?"
    - Then handle their request.

  **IF WRONG PERSON** (e.g., "I'm not in your system", "first time calling"):
    - "No problem! Let me get some information from you..."
    - Switch to UNKNOWN CALLER FLOW below.

  {{#if days_since_last_call > 45}}
    After they identify themselves:
    - "Can you confirm your claim number is still {{claim_number}}?"
    - "Has anything changed - phone number, email, anything?"
  {{/if}}

{{else}}
  ## UNKNOWN CALLER FLOW
  Use the standard intake process (current behavior).
  Full questions for their caller type.
{{/if}}
```

**KEY:** The purpose-first approach means quick calls stay quick.
Frustrated callers become happy callers.

**NOTE:** The exact Retell syntax may vary. Test in Retell dashboard.

---

## FAMILY MEMBER / NAME MISMATCH SCENARIOS

### Scenario A: Family Member Answers Client's Phone
```
Database: Maria Rodriguez, +1234567890
Caller: "No, this is her husband Jose"

MARIA SHOULD:
1. "Hi Jose, no problem. Are you calling on behalf of Maria?"
2. Help them, take message
3. Note in notification: "Spoke with husband Jose"

DATABASE SHOULD:
- Do NOT update Maria's profile with Jose's info
- Do NOT create new caller record
- Just log interaction with note about family member
```

### Scenario B: Client Changed Name (Marriage, etc.)
```
Database: Maria Rodriguez
Caller: "It's Maria Garcia now, I got married"

MARIA SHOULD:
1. "Congratulations! Let me update that for you."

DATABASE SHOULD:
- Update name (version history preserved)
- Add note: "Name changed - marriage"
```

### Scenario C: Phone Number Reassigned (Wrong Number)
```
Database: Maria Rodriguez, +1234567890
Caller: "Wrong number, I just got this phone"

MARIA SHOULD:
1. "I apologize for the confusion."
2. "Is there anything I can help you with today?"

DATABASE SHOULD:
- Flag phone number as potentially stale
- Do NOT delete Maria's record
- Add note: "Phone may be reassigned"
```

### Scenario D: Same Name, Different Person at Org
```
Database: "John Smith" from Progressive
Caller: "This is Jonathan Smith from Progressive"

MARIA SHOULD:
1. "Are you also known as John Smith, or are you a different person?"

DATABASE SHOULD:
- Same person → Add alternate name "Jonathan"
- Different person → Create new contact
```

### Scenario E: Two People, Same Name, Same Org
```
Two "John Smith" at Progressive

MARIA SHOULD:
- Ask for email to distinguish

DATABASE SHOULD:
- Store both with different emails as unique identifier
```

---

## ADDITIONAL FAILURE SCENARIOS

### Phone Number Issues
| Problem | Solution |
|---------|----------|
| Caller ID blocked | Treat as new, ask everything |
| Personal cell (not office) | Ask "Are you calling from [org type]?" |
| Phone reassigned | Confirm name, flag if mismatch |

### Data Quality Issues
| Problem | Solution |
|---------|----------|
| Transcript typos | Spelling confirmation mandatory |
| Duplicate records | Phonetic matching before create |
| Wrong claim number | Always repeat back for confirmation |

### System Issues
| Problem | Solution |
|---------|----------|
| Webhook timeout | Return defaults quickly |
| Database slow | Set timeout, use defaults |
| Duplicate webhook | Dedup logic exists |

### Professional Caller Issues
| Problem | Solution |
|---------|----------|
| Left the company | Ask "Still with [org]?" after 60 days |
| Company renamed | Fuzzy matching, ask to confirm |
| New client not in system | Create new association |

### Client Issues
| Problem | Solution |
|---------|----------|
| Multiple cases | "Calling about [case type] or something else?" |
| Info outdated | 45-day re-verification |
| New incident | "Existing case or new incident?" |

### AI Extraction Issues
| Problem | Solution |
|---------|----------|
| Extracts garbage | Validate before saving |
| Hallucinates claim # | Only save if high confidence |
| Transcript too short | Don't save, flag incomplete |

---

## RESUME POINT

If context is lost, start here:
1. Read this file: `/Users/chrislanzilli/nodejs/CALLER_RECOGNITION_PLAN.md`
2. Continue from the "NEXT ACTIONS" section below

---

## SESSION LOG: December 13, 2024

### What We Accomplished Today

#### 1. Backfill Script Created & Run
- Created `/Users/chrislanzilli/nodejs/backfill-caller-recognition.js`
- Used Gemini 2.0 Flash API for extraction (faster/cheaper than Anthropic)
- Extracted data from 457 CourtLaw calls with transcripts
- Category-specific extraction (Insurance, Medical, Attorney, Existing Client, New Lead)
- Language detection (English/Spanish)

#### 2. Data Populated in Database
**Final counts after manual verification:**
- **63 Organizations** (insurance, law firms, medical offices)
- **110 Organization Contacts** (individuals at those orgs)
- **35 Existing Clients** (verified, accurate names)
- **12 New Leads** (verified)
- **11 Spanish Speakers** detected

#### 3. Manual Data Accuracy Review
We found significant issues with AI extraction and manually fixed them:

**Removed miscategorized callers (professionals marked as clients):**
- Vanessa from ESC Doctors → MEDICAL org contact
- Kelly from Progressive → INSURANCE org contact
- Karen Ksopko from GEICO → ATTORNEY org contact
- Ricardo from Hudson Regional Hospital → MEDICAL org contact
- Tyran Basel from Helmsman TPA → INSURANCE org contact
- George Diaz from Progressive → INSURANCE org contact
- Avinash from Rawlings/Aetna → INSURANCE org contact
- Danielle Mintz from Capehart Scathard → ATTORNEY org contact

**Fixed garbled names:**
- "IIn" → "John Pope"
- "JOHNSON" → "Sheena Johnson"
- "Anaranirez" → "Ana Ramirez"
- "johnnIeM" → "Johnnie Mae"
- "alfonzll" → "Alfonso Lampley"
- "Gabriel Genser Coast" → "Gabriel Jensen Cuevas Encarnación"
- "aIw" → "Edward Monroe"
- And many others

**Removed unreliable data:**
- Removed garbled emails/claim numbers from transcripts that were unintelligible
- Deleted duplicate records
- Merged duplicate organizations (Gyco→Geico, etc.)

#### 4. First-Name-Only Problem Solved
**The Problem:** Some callers only provided first names (like "Jimmy"). We need full names for the CRM to work properly.

**The Solution - 3 Code Changes:**

**File 1: `/lib/callerCRM.js` - getCallerContext()**
```javascript
// Detect first-name-only and add to fieldsToAsk
const nameParts = profile.name.trim().split(/\s+/);
if (nameParts.length === 1) {
  fieldsToAsk.push('last name (just to update our records)');
}
```

**File 2: `/lib/callerCRM.js` - updateCallerFromCallData()**
```javascript
// When we receive just last_name, combine with existing first name
if (data.last_name && !data.first_name && !data.name) {
  const existingName = await getPool().query(...);
  if (nameParts.length === 1) {
    const fullName = `${currentName} ${data.last_name.trim()}`;
    // Update the record with full name
  }
}
```

**File 3: `/lib/extractAllCallData.js` - AI Extraction Prompt**
- Added `last_name` field to extraction
- AI now extracts last name separately when Maria asks for it specifically

**How It Works:**
1. Jimmy calls → System sees `name: "Jimmy"` (first-name-only)
2. `fieldsToAsk` includes `"last name (just to update our records)"`
3. Maria asks: "Just to update our records, what's your last name?"
4. Jimmy says: "Arrazqueta"
5. Extraction captures `last_name: "Arrazqueta"`
6. System combines: `"Jimmy" + "Arrazqueta"` = `"Jimmy Arrazqueta"`
7. Caller record updated with full name

**Test Result:**
```
fieldsToAsk: [ 'last name (just to update our records)', 'email' ]
✅ SUCCESS: System detected that last name is needed!
```

---

### Current Data State (End of Dec 13)

| Category | Count | Status |
|----------|-------|--------|
| Organizations | 63 | ✅ Clean, no duplicates |
| Org Contacts | 110 | ✅ Verified |
| Existing Clients | 35 | ✅ All verified accurate |
| New Leads | 12 | ✅ Verified |
| Spanish Speakers | 11 | ✅ Detected |
| First-name-only | 1 | Jimmy (will get last name on next call) |

---

### Files Modified Today

| File | Changes |
|------|---------|
| `/lib/callerCRM.js` | Added first-name-only detection, last_name combining logic |
| `/lib/extractAllCallData.js` | Added `last_name` field to AI extraction prompt |
| `/backfill-caller-recognition.js` | Created - Gemini-powered backfill script |
| `/check-current-data.js` | Created - View current caller data |
| `/fix-caller-accuracy.js` | Created - Apply accuracy fixes |
| `/cleanup-duplicates.js` | Created - Merge duplicate orgs |
| `/review-clients.js` | Created - Review all 35 clients |
| `/test-last-name-detection.js` | Created - Test the new logic |

---

### Scripts Created (For Future Use)

```bash
# View current caller data
node check-current-data.js

# Review all existing clients for issues
node review-clients.js

# Test last name detection for a specific caller
node test-last-name-detection.js

# Export transcripts for manual review
node export-transcripts-for-review.js
```

---

## NEXT ACTIONS (December 14+)

### Remaining Implementation Tasks

- [ ] **Deploy code changes** - The callerCRM.js and extractAllCallData.js changes need to be deployed
- [ ] **Update Maria's prompt in Retell** - Add two-flow logic (known vs unknown caller)
- [ ] **Test with live call** - Have Jimmy or another first-name-only caller call in
- [ ] **Monitor extraction accuracy** - Verify last_name field extracts correctly

### Phase 4: Maria Prompt Updates (NOT DONE YET)
The prompt changes from the plan (Flow 1 vs Flow 2) have NOT been added to Retell yet.
Maria currently does NOT use the caller recognition variables.

When ready to add:
1. Open Retell dashboard → CourtLaw Dec agent
2. Add the prompt logic from "Sample Maria Prompt Addition" section above
3. Test with a known caller number

### Phase 5-6: Webhook Updates (PARTIALLY DONE)
- Post-call webhook may need updates to save organization contacts consistently
- Inbound webhook sends context but Maria doesn't use it yet

---

## CRITICAL REMINDERS

1. **Jimmy's last name** - First caller with first-name-only. On next call, Maria will ask for last name.

2. **No CMS** - User doesn't have a case management system. All data lives in this PostgreSQL database.

3. **Accuracy over speed** - User explicitly said "I need accuracy. No false data."

4. **Spanish support** - 11 Spanish speakers identified. Maria is bilingual.

5. **Don't use Anthropic API for bulk extraction** - User said to use Gemini or do it manually for cost reasons.

---

## KEY FILES REFERENCE

```
/Users/chrislanzilli/nodejs/
├── lib/
│   ├── callerCRM.js         # Caller recognition logic (UPDATED)
│   └── extractAllCallData.js # AI extraction (UPDATED)
├── server.js                 # Main webhook handlers
├── backfill-caller-recognition.js  # Gemini backfill script
├── check-current-data.js     # View caller data
├── review-clients.js         # Review all clients
├── CALLER_RECOGNITION_PLAN.md # This file
└── transcripts-for-review.json # Exported transcripts
```

---

## QUICK START FOR NEXT SESSION

```bash
cd /Users/chrislanzilli/nodejs

# Check current data state
node check-current-data.js

# Review all 35 existing clients
node review-clients.js

# Test last name detection
node test-last-name-detection.js
```

Then continue with deploying the code changes and updating Maria's prompt.
