# AirTalk CS — Empathy Library: ChatGPT Generation Guide

## Context
You are helping build an empathy script library for **AirTalk**, a **mobile telecom service** company.
Our CS team handles customer service calls and chats for:
- Mobile number porting (port-in / port-out to/from other carriers)
- eSIM activation, transfer, and QR code issues
- Billing, payment, and refund disputes
- Account management: suspension, activation, plan changes
- Service issues: no signal, coverage, roaming
- SIM card and device order/shipping

**CRITICAL:** Every empathy phrase must make sense **specifically in a telecom CS interaction**.
Do NOT include phrases from banking, healthcare, e-commerce, or other industries.
If a phrase could apply to any company, rewrite it to be telecom-specific.

---

## Your Output: TSV Format

Output a single TSV block (Tab-Separated Values) with this exact header row:

```
id	situation	stage	script_en	script_vi	tone	tags
```

Rules:
- Separator = TAB character between each column
- No quotes around fields unless the text itself contains a tab
- IDs start from `emp-001` and increment sequentially
- `script_en` and `script_vi` are on the same row — do not split

---

## Column Definitions

| Column | Description | Example |
|---|---|---|
| `id` | Sequential ID | `emp-001` |
| `situation` | Emotional trigger / customer state (kebab-case) | `angry-long-wait` |
| `stage` | When in the conversation to use this | `opening` |
| `script_en` | Empathy phrase in English (1–2 sentences, natural speech) | `I'm so sorry you've been waiting...` |
| `script_vi` | Same phrase in natural Vietnamese CS speech (not literal translation) | `Tôi thành thật xin lỗi vì...` |
| `tone` | Communication tone | `apologetic` |
| `tags` | Comma-separated search keywords | `port, transfer, waiting, frustrated` |

---

## Stage Definitions

| Stage | When to use |
|---|---|
| `opening` | The first thing said when customer sounds upset or frustrated |
| `acknowledge` | Mid-conversation: validating the customer's feelings |
| `hold` | Before placing customer on hold or asking them to wait for a check |
| `de-escalate` | When customer is escalating: raising voice, threatening to leave/cancel |
| `closing` | Wrapping up after resolving issue but customer is still unsatisfied |

---

## Situations to Generate (telecom-specific only)

Generate **at least 3 phrases per situation** across different stages and tones.

### 1. `long-wait`
Customer has been waiting in queue or for a callback/resolution for too long.
- Reference telecom context: high call volume, system check, carrier coordination takes time

### 2. `port-out-fail`
Customer's number transfer **out** to another carrier failed or is delayed.
- Context: porting requires coordination with gaining carrier, may take 1–3 business days, can fail due to account mismatch

### 3. `port-in-fail`
Customer is trying to **bring their number in** from another carrier, and it failed.
- Context: previous carrier may not have released the number, losing carrier approval required

### 4. `esim-issue`
eSIM is not activating, QR code not scanning, profile download failed.
- Context: device compatibility, carrier profile push delays, iOS/Android differences

### 5. `billing-error`
Customer believes they were charged incorrectly or more than expected.
- Context: plan changes, proration, auto-renewal, international roaming charges

### 6. `refund-delayed`
Customer has been waiting for a refund (overpayment, cancelled plan, returned device).
- Context: refund via original payment method takes 5–10 business days, voucher option available

### 7. `service-outage`
Customer has no signal, dropped calls, or very slow data.
- Context: tower maintenance, coverage gaps, device-side issues vs. network issues

### 8. `account-suspended`
Customer's account was suspended unexpectedly (non-payment, fraud flag, port-out lock).
- Context: suspension is automated, CS can escalate for manual review

### 9. `plan-confusion`
Customer is confused about what plan they're on, why charges changed after a plan switch.
- Context: proration on mid-cycle changes, add-ons vs. base plan

### 10. `order-delayed`
SIM card or device order has not arrived within expected timeframe.
- Context: shipping via postal partner, customs delays for international orders

---

## Writing Rules

1. **Sound human** — phrases should feel like a real person is saying them, not a script
2. **Vary phrasing** — 3 options per situation must feel distinct, not just synonyms swapped
3. **Vietnamese**: natural spoken CS Vietnamese, not a word-for-word translation of English
4. **Keep it concise**: 1–2 sentences max per phrase
5. **Never promise specific outcomes** in an empathy phrase:
   - ❌ "I will fix this right now" → empathy only, no commitment
   - ✓ "I want to make sure we get this sorted for you"
6. **Tags**: include the situation keyword + emotion word + common search terms callers would type

---

## Tone Reference

| Tone | When to use | Feel |
|---|---|---|
| `apologetic` | Company/process caused the problem | Sincere, takes responsibility |
| `warm` | Customer is upset but not hostile | Caring, personal |
| `reassuring` | Customer is anxious, worried about outcome | Calm, confident |
| `formal` | Escalated situation or corporate customer | Professional, measured |

---

## TSV Example (first 3 rows)

```
id	situation	stage	script_en	script_vi	tone	tags
emp-001	long-wait	opening	I sincerely apologize for the wait — I know your time is valuable, and I'll do everything I can to help you right now.	Tôi thành thật xin lỗi vì đã để anh/chị chờ — thời gian của anh/chị rất quý báu, và tôi sẽ cố gắng hết sức để hỗ trợ anh/chị ngay bây giờ.	apologetic	long wait, queue, waiting, hold time
emp-002	long-wait	de-escalate	I completely understand your frustration — waiting this long is not acceptable, and I take full responsibility. Let me prioritize your case right now.	Tôi hoàn toàn hiểu sự bực bội của anh/chị — chờ đợi lâu như vậy là không thể chấp nhận được và tôi nhận trách nhiệm về điều này. Để tôi ưu tiên xử lý trường hợp của anh/chị ngay.	apologetic	long wait, angry, frustrated, escalate
emp-003	port-out-fail	opening	I'm really sorry to hear your number transfer didn't go through — I know how important it is to keep your number, and I'm going to look into exactly what happened.	Tôi rất tiếc khi nghe tin chuyển số không thành công — tôi hiểu số điện thoại của anh/chị quan trọng như thế nào, và tôi sẽ tìm hiểu ngay xem có chuyện gì xảy ra.	warm	port out, number transfer, failed, porting
```

---

## Prompt to paste into ChatGPT

```
Use the following guide to generate an empathy script library for AirTalk CS (telecom company).
Output ONLY the TSV block — no explanation, no markdown, no extra text.
Start with the header row. Generate at least 3 phrases per situation for all 10 situations listed.

[paste the full content of this file above]
```
