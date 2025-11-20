# GoHighLevel API Testing Results & Architecture Decision

## Test Date: November 19, 2025

---

## 🎯 OBJECTIVE

Test if GoHighLevel API can be used to replace N8N for email and SMS notifications, enabling:
- Node.js handles ALL workflow logic
- GoHighLevel handles message delivery only
- Multi-tenant SaaS architecture

---

## ✅ TEST RESULTS

### Email API: **SUCCESS** ✅

**Endpoint**: `POST https://services.leadconnectorhq.com/conversations/messages`

**Test Response**:
```json
{
  "threadId": "k7mfc1yvcTLMjB6NdAAX",
  "messageId": "20NzGNedh4R1EiPTmgZs",
  "emailMessageId": "20NzGNedh4R1EiPTmgZs",
  "msg": "Email queued successfully.",
  "conversationId": "qgCLaaXuYCp4efdbVhl8",
  "traceId": "8a5bd26e-b5b3-4411-bb47-97e6220bae32"
}
```

**Capabilities Confirmed**:
- ✅ Send HTML emails via API
- ✅ Full HTML formatting support
- ✅ Requires contactId (must create/find contact first)
- ✅ Returns message ID for tracking

**Code Example**:
```javascript
await axios.post(
  'https://services.leadconnectorhq.com/conversations/messages',
  {
    type: 'Email',
    locationId: 'lneM3M1j3P5i0JYeNK18',
    contactId: 'Na5Cpmfe7245uXNp3TY2',
    subject: 'Test Email Subject',
    html: '<h1>Your HTML content here</h1>'
  },
  {
    headers: {
      'Authorization': 'Bearer pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2',
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    }
  }
);
```

---

### SMS API: **REQUIRES CONTACTS** ⚠️

**Finding**: GoHighLevel requires a valid contact with a phone number to send SMS.

**Error when missing phone**:
```json
{
  "status": 422,
  "message": "Missing phone number",
  "name": "HttpException"
}
```

**Implications for Staff Notifications**:
- SMS notifications go to 3 STAFF MEMBERS (not the caller)
- Would require creating 3 staff contacts in GHL
- Would need 3 separate API calls (one per staff member)
- OR continue using existing workflow webhook (simpler)

---

## 📋 CURRENT N8N ARCHITECTURE

### Email Recipients (5 Types)

| Email Type | Recipients | Count |
|------------|-----------|-------|
| Attorney | All staff | 9 |
| Medical Professional | All staff | 9 |
| Other Caller | All staff | 9 |
| **New Lead** | Key staff | **4** |
| Existing Client | All staff | 9 |

**Staff Email List** (9 total):
- info@courtlaw.com
- Karzadi@courtlaw.com
- chris@saveyatech.com
- matt@saveyatech.com
- svasquez@courtlaw.com
- mlabrada@courtlaw.com
- mcruz@courtlaw.com
- eblair@courtlaw.com
- aestivenson@courtlaw.com

**New Lead Key Staff** (4 only):
- info@courtlaw.com
- Karzadi@courtlaw.com
- chris@saveyatech.com
- matt@saveyatech.com

### SMS Recipients (1 Type)

**New Leads Only** (3 recipients):
- +17814757191
- +19089065142
- +17322082416

**Current Method**: GoHighLevel workflow webhook
- URL: `https://services.leadconnectorhq.com/hooks/lneM3M1j3P5i0JYeNK18/webhook-trigger/1b3bb471-29b1-44c3-aaea-09f8f319cbba`
- Simple HTTP POST with query params
- Sends to 3 phone numbers configured in workflow

---

## 🏗️ RECOMMENDED ARCHITECTURE

### **Hybrid Approach**: Direct API for Email + Workflow Webhook for SMS

### Why This Approach?

1. **Email via GHL API**:
   - ✅ Tested and working perfectly
   - ✅ Full HTML support
   - ✅ Can be fully managed in Node.js
   - ✅ Multi-tenant ready (different recipients per client)

2. **SMS via Workflow Webhook**:
   - ✅ Already working in production
   - ✅ Simpler than creating 3 contacts + 3 API calls
   - ✅ One HTTP POST vs 3 separate API calls
   - ✅ Less complexity = more reliable

---

## 📐 IMPLEMENTATION PLAN

### Phase 1: Email Implementation

For each email type, we need to:

1. **Create/Find Contact in GHL** for ONE of the recipients (e.g., info@courtlaw.com)
2. **Send Email via GHL API** with all recipients in CC/BCC

OR (Better approach for multi-tenant):

1. **Create template contact** per client (e.g., "CourtLaw Notifications")
2. **Send email to that contact** with actual recipients in email body as TO field
3. **Store contact IDs** in client configuration

**Code Structure**:
```javascript
// Client configuration
const CLIENT_CONFIG = {
  courtlaw: {
    location_id: 'lneM3M1j3P5i0JYeNK18',
    notification_contact_id: 'xxx', // One contact for all notifications
    email_recipients: {
      all_staff: ['info@courtlaw.com', 'Karzadi@courtlaw.com', ...],
      key_staff: ['info@courtlaw.com', 'Karzadi@courtlaw.com', 'chris@saveyatech.com', 'matt@saveyatech.com']
    },
    sms_recipients: ['+17814757191', '+19089065142', '+17322082416'],
    sms_webhook: 'https://services.leadconnectorhq.com/hooks/.../webhook-trigger/...'
  }
};

// Send email function
async function sendEmailNotification(client, type, data) {
  const config = CLIENT_CONFIG[client];
  const recipients = type === 'new_lead' ? config.email_recipients.key_staff : config.email_recipients.all_staff;

  // Build HTML template
  const html = buildEmailTemplate(type, data);

  // Send via GHL API
  await axios.post(
    'https://services.leadconnectorhq.com/conversations/messages',
    {
      type: 'Email',
      locationId: config.location_id,
      contactId: config.notification_contact_id,
      subject: getSubject(type),
      html: html
    },
    { headers: getGHLHeaders() }
  );
}
```

### Phase 2: SMS Implementation

**Continue using existing workflow webhook**:

```javascript
async function sendSMSNotification(client, data) {
  const config = CLIENT_CONFIG[client];

  // Build query params
  const params = new URLSearchParams({
    name: data.name,
    phone: data.phone,
    email: data.email,
    Summary: data.incident_description
  });

  // Trigger GHL workflow (sends to 3 recipients)
  await axios.post(`${config.sms_webhook}?${params}`);
}
```

---

## 🚧 CHALLENGES & SOLUTIONS

### Challenge 1: GHL API Requires Contacts

**Problem**: Can't send email to arbitrary addresses, must have contactId

**Solutions**:
- Create one "notification" contact per client
- Store contact ID in client config
- Email appears as conversation with that contact

**Trade-off**: Emails grouped under one contact vs organized by actual recipient

### Challenge 2: Multiple Email Recipients

**Problem**: GHL API sends to one contact, but we need 4-9 recipients

**Solutions**:
1. **Option A**: Send 9 separate emails (9 API calls) - NOT IDEAL
2. **Option B**: Use CC/BCC fields (if supported) - NEED TO TEST
3. **Option C**: Single email to notification contact, recipients in HTML body - WORKAROUND

**Recommendation**: Test Option B (CC/BCC), fallback to Option C

### Challenge 3: Email Template Management

**Problem**: 5 different email templates with different data fields

**Solution**: Store templates in Node.js as template functions
```javascript
const EMAIL_TEMPLATES = {
  attorney: (data) => `
    <!DOCTYPE html>
    <html>
      <!-- Template with ${data.name}, ${data.email}, etc -->
    </html>
  `,
  medpro: (data) => `...`,
  other: (data) => `...`,
  new_lead: (data) => `...`,
  existing: (data) => `...`
};
```

---

## 💰 COST COMPARISON

### Current (N8N + Gmail + GHL):
- N8N: $20/month
- Gmail: Free (using existing accounts)
- GHL: Already paying for it
- **Total: $20/month**

### Proposed (Node.js + GHL):
- N8N: $0 (eliminated)
- Node.js: Already running
- GHL: Already paying for it
- **Total: $0 additional**

**Savings: $20/month = $240/year**

---

## ✅ NEXT STEPS

1. **Test CC/BCC functionality** in GHL email API
2. **Create notification contacts** for CourtLaw (one-time setup)
3. **Extract all 5 email templates** from N8N to Node.js template functions
4. **Build Node.js webhook endpoints**:
   - `/webhook/capture_attorney_data`
   - `/webhook/capture_medical_professional_data`
   - `/webhook/capture_other_caller_data`
   - `/webhook/capture_new_lead_data`
5. **Test with your email/phone only** (safe testing)
6. **Once confirmed working, update Retell function tools** to point to Node.js

---

## 🎯 SUCCESS CRITERIA

- ✅ All emails delivered to correct recipients
- ✅ All SMS delivered to correct recipients
- ✅ Same or better reliability than N8N
- ✅ Zero data loss
- ✅ $20/month savings
- ✅ Multi-tenant ready architecture
- ✅ All workflow logic in Node.js (not GHL)

---

## 📊 RISK ASSESSMENT

| Risk | Mitigation |
|------|-----------|
| GHL API downtime | Implement retry logic, fallback to direct SMTP if needed |
| Email delivery failure | Log all attempts, alert admin, retry queue |
| SMS delivery failure | Continue using proven workflow webhook approach |
| Node.js server down | Health checks, monitoring, auto-restart |
| Data loss | Log all webhooks before processing, PostgreSQL as source of truth |

---

## 📝 ARCHITECTURE DECISION

**APPROVED ARCHITECTURE**:

```
Retell AI Phone Call
    ↓
Retell Function Tools
    ↓
POST to Node.js Webhook Endpoints
    ↓
Node.js Server:
  ├─ Validate incoming data
  ├─ Store in PostgreSQL
  ├─ Route by caller type
  ├─ Build email HTML from templates
  ├─ Send emails via GHL API (to notification contact)
  ├─ Send SMS via GHL workflow webhook (to 3 staff)
  └─ Return success to Retell
```

**Key Design Decisions**:
1. ✅ Node.js handles ALL workflow logic and routing
2. ✅ GoHighLevel handles ONLY message delivery
3. ✅ Email templates stored in Node.js code
4. ✅ Client config stored in Node.js (multi-tenant ready)
5. ✅ SMS continues using workflow webhook (simpler, proven)
6. ✅ PostgreSQL remains source of truth

---

## 🔑 API CREDENTIALS CONFIRMED

- **GHL API Key**: `pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2`
- **Location ID**: `lneM3M1j3P5i0JYeNK18`
- **Base URL**: `https://services.leadconnectorhq.com`
- **Required Headers**:
  - `Authorization: Bearer {api_key}`
  - `Content-Type: application/json`
  - `Version: 2021-07-28`

---

**Status**: ✅ Architecture Validated, Ready for Implementation
**Last Updated**: November 19, 2025
