# CourtLaw Call Handling System - Complete Documentation

## System Overview

The current system uses **Retell AI** for voice agent calls → **N8N** for workflow automation → **GoHighLevel** for SMS/Email delivery.

**Goal**: Eliminate N8N dependency ($20/month savings) and centralize everything in the Node.js application.

---

## 1. Retell AI Agent Configuration

### Agent Details
- **Agent Name**: Courtlaw Voice Agent Correct Version
- **Agent ID**: `agent_8e50b96f7e7bb7ce7479219fcc`
- **Phone Number**: +1(201)862-4576
- **Voice**: Kathrine
- **Model**: GPT 4.1 Fast
- **Cost**: $0.138/min
- **Latency**: 1500-2150ms
- **Total Calls**: 1,536

### Agent-Level Webhook
- **Status**: NOT CONFIGURED (field is empty)
- **Implication**: Webhooks are configured at the function tool level, not agent level

### Function Tools (5 total)

The Retell agent uses 5 function tools to handle different caller types:

1. **`capture_case_data`**
   - For: Injured parties (new clients)
   - Purpose: Collect comprehensive case information

2. **`capture_other_caller_message`**
   - For: Other callers (vendors, job applicants, general inquiries)
   - Purpose: Take message and basic info

3. **`capture_attorney_data`**
   - For: Attorneys calling about cases
   - Purpose: Collect attorney inquiry details

4. **`capture_medical_professional_inquiry`**
   - For: Medical professionals or insurance companies
   - Purpose: Handle medical/insurance inquiries

5. **`end_call`**
   - Purpose: Terminate calls

**Note**: I attempted to view individual function configurations to see webhook URLs, but the Retell UI was unresponsive. However, the N8N webhook paths indicate the connection:

---

## 2. N8N Workflow Structure

### Webhook Entry Points

N8N receives data from Retell through these webhook endpoints:

| Webhook Node Name | Webhook Path | Webhook ID | Full URL |
|-------------------|--------------|------------|----------|
| Attorney_Call_Hook | `capture_attorney_data` | `73b2aeb7-2b40-41ce-91bb-b3c291fa4f72` | `https://n8n-production-08ed.up.railway.app/webhook/capture_attorney_data` |
| MedPro_Call_Hook | `CaseLaw_MedPro_data_capture` | `44f7d8f2-999d-481f-89a4-a6a07d1df4ee` | `https://n8n-production-08ed.up.railway.app/webhook/CaseLaw_MedPro_data_capture` |
| Other_Call_Hook | `CaseLaw_Other_data_capture` | `44f7d8f2-999d-481f-89a4-a6a07d1df4ee` | `https://n8n-production-08ed.up.railway.app/webhook/CaseLaw_Other_data_capture` |
| New Leads Hook | `CaseLaw_capture_New_Lead_data` | `02d8caec-2e47-4631-95c2-e961ad3e4592` | `https://n8n-production-08ed.up.railway.app/webhook/CaseLaw_capture_New_Lead_data` |

### Case Type Routing

For injured parties, N8N uses a **Switch node** to route based on `case_type`:

- `uber`, `lyft`, `rideshare` → Process Rideshare Specific Data
- `construction` → Process Construction Specific Data
- `motorcycle` → Process Motorcycle Specific Data
- `truck`, `bus`, `taxi` → Process Truck/Bus/Taxi Specific Data
- `slip_fall` → Process Slip & Fall Specific Data
- `rear_end` → Process Rear-End Specific Data
- `workers_comp` → Process Workers' Comp Specific Data
- **Fallback** → Default processing

### Google Sheets Integration (TO BE ELIMINATED)

N8N currently writes to Google Sheets (multiple append operations):
- `Append row in sheet`
- `Append row in sheet1`
- `Append row in sheet2`
- `Append row in sheet3`
- `Append or update row in sheet2`

**User wants to eliminate this** - PostgreSQL is the source of truth.

---

## 3. Email Notifications

### Email Recipients (All 3 types go to the same list)

```
info@courtlaw.com
Karzadi@courtlaw.com
chris@saveyatech.com
matt@saveyatech.com
svasquez@courtlaw.com
mlabrada@courtlaw.com
mcruz@courtlaw.com
eblair@courtlaw.com
aestivenson@courtlaw.com
```

**Total: 9 recipients**

### Email Node 1: Send Email Attorney

- **Gmail Node**: `n8n-nodes-base.gmail`
- **Subject**: `Inbound Call Alert — Attorney`
- **Template**: Full HTML email with:
  - Dark header: "Inbound Call Alert — Attorney"
  - Summary banner with Purpose
  - Caller Details table:
    - Name
    - Verbally Stated Phone
    - Inbound Phone
    - Email
    - Who Representing
    - Case Name
    - Claim Number
    - Purpose
  - CTA buttons: "Call" and "Email"
  - Professional footer

**Data Fields Used**:
- `$json.Name`
- `$json.Phone`
- `$json.InboundPhoneNum`
- `$json.Email`
- `$json['Who Representing']`
- `$json['Case Name']`
- `$json['Claim Num']`
- `$json.Purpose`

### Email Node 2: Send Email Med Pro

- **Gmail Node**: `n8n-nodes-base.gmail`
- **Subject**: `Inbound Call Alert — Medical Professional`
- **Template**: Similar HTML structure to Attorney email
- **Caller Details**:
  - Name
  - Verbally Stated Phone
  - Inbound Phone
  - Email
  - Claim Number
  - Who Representing
  - Client Name
  - Purpose

**Data Fields Used**:
- `$json.Name`
- `$json.Phone`
- `$json.InboundPhoneNum`
- `$json.Email`
- `$json.Claim`
- `$json.representing_who`
- `$json.client_name`
- `$json.Purpose`

### Email Node 3: Send Email Other

- **Gmail Node**: `n8n-nodes-base.gmail`
- **Subject**: `Inbound Call Alert — Other Caller`
- **Template**: Similar HTML structure
- **Caller Details**:
  - Name
  - Verbally Stated Phone
  - Inbound Phone
  - Email
  - Purpose
  - Who Representing
  - Client Name
  - Claim Number

**Data Fields Used**:
- `$json.Name`
- `$json.Phone`
- `$json.from_number`
- `$json.Email`
- `$json.Purpose`
- `$json.representing_who`
- `$json.client_name`
- `$json.claim_num`

---

## 4. SMS Notifications

### GoHighLevel Workflow

**Workflow URL**: `https://app.gohighlevel.com/location/lneM3M1j3P5i0JYeNK18/workflow/8d57f3ae-9023-4b11-82df-f1185f166c74`

### SMS Template

```
New Inbound Lead

Name: {{inboundWebhookRequest.queryParams.name}}
Phone Number: {{inboundWebhookRequest.queryParams.phone}}
Email: {{inboundWebhookRequest.queryParams.email}}
Summary: {{inboundWebhookRequest.queryParams.Summary}}
```

### SMS Recipients (3 people)

```
+17814757191
+19089065142
+17322082416
```

### GoHighLevel Webhook Trigger

**URL**: `https://services.leadconnectorhq.com/hooks/lneM3M1j3P5i0JYeNK18/webhook-trigger/1b3bb471-29b1-44c3-aaea-09f8f319cbba`

**Currently Called By**: N8N HTTP Request node (active)
- 3 deactivated duplicate HTTP Request nodes exist in N8N

---

## 5. Data Flow Architecture

### Current Flow

```
Retell AI Phone Call
    ↓
Retell Function Tools Execute
    ↓
POST to N8N Webhook URLs
    ↓
N8N Processes Data:
  - Routes by caller type
  - Routes by case type (for injured parties)
  - Appends to Google Sheets
  - Sends Gmail notifications (3 types)
  - POSTs to GoHighLevel webhook
    ↓
GoHighLevel Sends SMS (3 recipients)
```

### Proposed Flow (N8N Replacement)

```
Retell AI Phone Call
    ↓
Retell Function Tools Execute
    ↓
POST to Node.js Webhook Endpoints
    ↓
Node.js Server:
  - Validates incoming data
  - Stores in PostgreSQL
  - Sends emails via GoHighLevel API
  - Sends SMS via GoHighLevel API
  - Returns success response to Retell
  - Logs all operations
  - SMS alerts on failures
```

---

## 6. Key Insights & Requirements

### What We Learned

1. **No Agent-Level Webhook**: Retell uses function-level webhooks, not agent-level
2. **4 Webhook Entry Points**: Attorney, MedPro, Other, New Leads
3. **Same Email Recipients**: All 3 email types go to the same 9 people
4. **3 SMS Recipients**: Smaller list for SMS notifications
5. **Case Type Routing**: 11 different case types with fallback
6. **Google Sheets Dependency**: Currently writes to sheets, needs elimination
7. **GoHighLevel Integration**: Already using GHL for SMS, can extend to email

### User Requirements

- ✅ Eliminate N8N ($20/month savings)
- ✅ Centralize all logic in Node.js application
- ✅ Use GoHighLevel for SMS and email delivery
- ✅ Maintain PostgreSQL as source of truth
- ✅ Comprehensive error handling with SMS alerts
- ✅ Same or better reliability than current system
- ✅ No data loss during transition

### Technical Challenges

1. **GoHighLevel Email API**: Need to implement email sending via GHL
2. **HTML Email Templates**: Need to preserve exact templates in Node.js
3. **Webhook Configuration**: Need to update Retell function tools to point to new Node.js endpoints
4. **Error Handling**: Implement robust retry logic and SMS failure alerts
5. **Testing**: Must test thoroughly without disrupting live production calls

---

## 7. Implementation Plan

### Phase 1: Setup (No Production Impact)

1. Create Node.js webhook endpoints:
   - `/webhook/capture_attorney_data`
   - `/webhook/capture_medical_professional_data`
   - `/webhook/capture_other_caller_data`
   - `/webhook/capture_new_lead_data`

2. Store HTML email templates in Node.js (separate files or embedded)

3. Implement GoHighLevel email API integration

4. Implement GoHighLevel SMS API integration

5. Add comprehensive logging and error handling

### Phase 2: Testing (Parallel Running)

1. Set up test Retell agent (duplicate of production)

2. Point test agent function tools to new Node.js webhooks

3. Make test calls and verify:
   - Emails are sent correctly (9 recipients)
   - SMS are sent correctly (3 recipients)
   - Data is stored in PostgreSQL
   - No errors occur

4. Compare test results with production N8N results

### Phase 3: Cutover (Production Change)

1. Update production Retell function tool webhooks:
   - Change from N8N URLs to Node.js URLs
   - One function at a time (start with "Other" as lowest risk)

2. Monitor closely for any failures

3. If any issues, immediately revert to N8N URLs

4. Once all functions migrated successfully, deactivate N8N workflow

5. Keep N8N workflow as backup for 1 week before canceling subscription

### Phase 4: Cleanup

1. Remove Google Sheets integration (already using PostgreSQL)

2. Archive N8N workflow export as documentation

3. Document new architecture

4. Cancel N8N subscription (save $20/month)

---

## 8. Data Schema Requirements

### Webhook Payload Fields

Based on email templates, the Node.js webhooks must handle these fields:

**Attorney Webhook**:
- `Name`
- `Phone`
- `InboundPhoneNum`
- `Email`
- `Who Representing`
- `Case Name`
- `Claim Num`
- `Purpose`

**Medical Professional Webhook**:
- `Name`
- `Phone`
- `InboundPhoneNum`
- `Email`
- `Claim`
- `representing_who`
- `client_name`
- `Purpose`

**Other Caller Webhook**:
- `Name`
- `Phone`
- `from_number`
- `Email`
- `Purpose`
- `representing_who`
- `client_name`
- `claim_num`

**New Lead Webhook** (for GoHighLevel SMS):
- `name`
- `phone`
- `email`
- `Summary`

---

## 9. Risk Mitigation

### Critical Risks

1. **Webhook Downtime**: If Node.js server is down, calls will fail
   - **Mitigation**: Implement health check endpoint, monitoring alerts

2. **Email Delivery Failure**: GoHighLevel API issues
   - **Mitigation**: Implement retry logic, fallback to direct SMTP if needed

3. **SMS Delivery Failure**: GoHighLevel API issues
   - **Mitigation**: Queue SMS for retry, alert admin via separate channel

4. **Data Loss**: PostgreSQL insert fails
   - **Mitigation**: Log all webhook payloads to file before processing

### Monitoring Requirements

- Health check endpoint: `/health`
- Log all webhook requests to file (timestamped)
- Alert admin via SMS if any webhook fails 3 times in a row
- Daily summary email of system health

---

## 10. Next Steps

**Immediate Actions**:

1. ✅ **COMPLETED**: Document entire N8N workflow and Retell configuration
2. Set up GoHighLevel API credentials and test email sending
3. Implement Node.js webhook endpoints (without activating)
4. Create test Retell agent for safe testing
5. Run parallel test for 24-48 hours
6. Execute production cutover (one function at a time)

**Timeline Estimate**: 2-3 development sessions

**Success Criteria**:
- All emails delivered correctly
- All SMS delivered correctly
- Zero data loss
- Same or faster notification speed
- $20/month cost savings achieved

---

## END OF DOCUMENTATION

**Last Updated**: November 19, 2025
**Status**: Analysis Complete, Ready for Implementation Planning
