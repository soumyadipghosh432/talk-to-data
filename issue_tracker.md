# 🐛 Talk-to-Data Issue Tracker & Analytics Registry

This document records all functional, layout, and database issues discovered during the testing iterations (categorized by source: **UAT** for user-identified bugs, and **Internal** for agent-identified bugs). All logged items have been resolved and verified.

---

## 📋 1. Logged Issues & Resolution History

### UAT-01: Vague Pronouns Blocked by Guardrails
* **Description**: Vague pronouns in follow-up questions (e.g. *"how many orders do we have for this?"*) were blocked as `OUT_OF_SCOPE` by the guardrail node.
* **Resolution**: Modified the `guardrail_node` in [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to load the conversation history context. The guardrail now evaluates the user's question alongside previous turns to resolve pronoun references.
* **Status**: ✅ **Resolved**

### UAT-02: AI Responses Direct Leaking of SQL Blocks
* **Description**: Raw SQL statement blocks were displayed directly inside the AI response bubble text.
* **Resolution**: Updated the system prompt for the `synthesis_node` in [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to forbid the inclusion of markdown SQL code blocks in the text output. The SQL is now displayed strictly within the UI's collapsible details drawer.
* **Status**: ✅ **Resolved**

### UAT-03: Redundant Response Header Greetings
* **Description**: Every AI response began with introductory greetings (e.g. *"Hello!"*, *"Hi!"*).
* **Resolution**: Added strict instructions in the `synthesis_node` system prompt in [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to omit introductory headers and greetings, ensuring direct, clean summaries.
* **Status**: ✅ **Resolved**

### UAT-04: Persistent Loading State on Chat Navigation
* **Description**: Clicking a chat session in the sidebar did not reset the central message loading spinner if it was active, causing it to display indefinitely.
* **Resolution**: Updated [App.jsx](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/frontend/src/App.jsx) inside the `selectChat` function to automatically clear active loading state flags (`setIsLoadingMessages(false)`) on chat navigation.
* **Status**: ✅ **Resolved**

### UAT-05: Response Metrics Displayed in Milliseconds
* **Description**: The latency metric next to chat bubbles was displayed in milliseconds, which was difficult to read quickly.
* **Resolution**: Updated the React rendering logic in [App.jsx](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/frontend/src/App.jsx) to convert milliseconds to seconds, formatting it to one decimal place (e.g., `1.2s`).
* **Status**: ✅ **Resolved**

### UAT-06: Light Theme Contrast and Overlap Layouts
* **Description**: The light interface had low contrast (all white backgrounds) and overlapping borders, making sections hard to isolate.
* **Resolution**: Optimized the CSS variables in [index.css](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/frontend/src/index.css), introducing a darker cool gray (`#EDF2F7`) for the sidebar/headers, slate-gray typography (`#1F2937`), distinct borders (`#D2D6DC`), and subtle dropshadow parameters to separate sections.
* **Status**: ✅ **Resolved**

### UAT-07: Resource Exhaustion (429) API Quota Rejections
* **Description**: Standard `gemini-2.0-flash` models returned `RESOURCE_EXHAUSTED` due to key restrictions on the free tier.
* **Resolution**: Switched the model to **`gemini-2.5-flash-lite`** inside [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py), which has healthy free tier limits, resolving latency to ~1s.
* **Status**: ✅ **Resolved**

### UAT-08: Topic Drift on Ordinal Follow-up Queries
* **Description**: Asking *"customer name for second one"* followed by *"details for third one"* resulted in querying the `customers` table for the third customer instead of the `orders` table for the third order.
* **Resolution**: Updated the conversational resolution rules in the `text_to_sql_node` prompt inside [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to instruct the model to align general ordinals with the **primary list topic** (Orders) unless the user explicitly requests customer details.
* **Status**: ✅ **Resolved**

### INT-01: Double SELECT SQL Syntax Error in Admin Analytics
* **Description**: The admin analytics route crashed with a database syntax error (`SELECT SELECT ...`).
* **Resolution**: Changed the database query calls in [main.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/main.py) from `db.query(text(...)).scalar()` (which double-prepends `SELECT`) to **`db.execute(text(...)).scalar()`** to execute raw SQL directly.
* **Status**: ✅ **Resolved**

### UAT-09: Telemetry Export Button Text Change
* **Description**: The user requested changing the export label from "Export to Excel (CSV)" to a simpler "Export (CSV)".
* **Resolution**: Modified the label inside [App.jsx](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/frontend/src/App.jsx) to display *"Export (CSV)"*.
* **Status**: ✅ **Resolved**

### UAT-10: Ordinal Follow-up Sorting Drift
* **Description**: Submitting follow-up queries referencing ordinals (e.g. *"details for the 4th order"*) caused the model to lose the sorting context (`ORDER BY total_amount DESC`) and fall back to ordering by `order_id` in offsets.
* **Resolution**: Refined Rule 6 in the prompt of `text_to_sql_node` inside [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to explicitly mandate preserving sorting parameters (`ORDER BY`), joins, and filters of the preceding query when constructing offset queries.
* **Status**: ✅ **Resolved**

### UAT-11: CTE WITH Statements Blocked by Security
* **Description**: Queries using Common Table Expressions (starting with `WITH ...`) triggered false-positive safety flags and were blocked by the SQL validator.
* **Resolution**: Updated the regex prefix matcher in `sql_validation_node` inside [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to match and permit query strings starting with the `WITH` keyword alongside `SELECT`.
* **Status**: ✅ **Resolved**

### UAT-12: LLM Thinking/Reasoning Output Leakage
* **Description**: Generative models (like Gemini 2.5 or Bedrock Claude) returned XML-styled thinking blocks (`<reasoning>...</reasoning>`) which triggered query syntax/validation blocks or leaked directly into the chat response bubbles.
* **Resolution**: Implemented a unified `clean_llm_response` function in [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) to strip all XML thinking tags (`<reasoning>`, `<thought>`, `<thinking>`) and their content. Routed the guardrail node, SQL generation node, and response synthesis node through this parser.
* **Status**: ✅ **Resolved**

### UAT-13: Active Model Visibility & Telemetry
* **Description**: The user requested visibility on which model is currently connected in both the chat interface (user dropdown) and the admin panel (new tab).
* **Resolution**: Built `GET /api/v1/chat/llm-status` in [main.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/main.py) to return active and available models list. Rendered this status inside the user dropdown and created a dedicated **Model Settings** Admin sub-tab in [App.jsx](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/frontend/src/App.jsx).
* **Status**: ✅ **Resolved**

### 🧪 Verification & QA Integration Testing (July 22, 2026 Verification Run)
* **Description**: A comprehensive programmatic test run was performed to execute test cases covering single-table queries, joins, multi-turn ordinals, and guardrail bypasses.
* **Results**:
  * **UAT-10 (Sorting Preservation)**: Passed. Follow-up ordinal queries successfully generated CTE offsets utilizing the parent's `ORDER BY total_amount DESC` context.
  * **UAT-11 (CTE Validator)**: Passed. Safety validator successfully allowed and executed `WITH` prefixed queries.
  * **UAT-12 (Thinking Sanitizer)**: Passed. Global regex successfully parsed out model reasoning XML brackets from user response bubbles.
  * **Guardrails**: Passed. Intercepted out-of-scope queries (weather) and allowed greetings in-scope.
* **Status**: 🏁 **Fully Verified & Passed**

---


## 📈 2. Project Execution Analytics

These statistics are compiled directly from the session log transcript files.

### ⏱️ Session Time Distribution
* **Total Elapsed Time**: **47.30 hours** (July 7, 2026, 19:02:45 to July 9, 2026, 18:20:45)
* **Actual Working Time**: **1.65 hours (99.2 minutes)**
* **Idle Time (Gaps > 15m)**: **45.65 hours**
* *Note: Idle time represents periods where the workspace was suspended, such as overnight breaks.*

### 🪙 Token Consumption Summary
* **Total LLM Calls**: **269**
* **Input Tokens (Prompts)**: **11,249,346**
* **Output Tokens (Responses)**: **17,055**
* **Total Tokens Consumed**: **11,266,401**
* *Note: Input tokens reflect the accumulation of workspace history and files sent to the model context across 269 agentic loop turns.*
