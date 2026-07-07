# Talk-to-Data Implementation Plan

This document outlines the design and step-by-step implementation plan for the **Talk-to-Data** application.

## User Review Required

> [!IMPORTANT]
> - **PostgreSQL Host**: The application will connect to `localhost:5432` by default. We will define database credentials (user, password, DB name) in a `.env` file. You will need to ensure your PostgreSQL service is running and credentials match.
> - **Seeding Execution**: We will write a standalone Python script `seed_data.py` to seed both the security/roles tables and the 5 sample business tables with >50 realistic records.
> - **LLM Keys**: Placeholders for `GOOGLE_GEMINI_KEY` and `OPENAI_API_KEY` will be created in the `.env` file. We will require `GOOGLE_GEMINI_KEY` for the default `GOOGLE_GEMINI_API` model configuration.

---

## Proposed Folder Structure

We will structure the project into clean `backend/` and `frontend/` workspaces to maintain separation of concerns:

```
talk-to-data/
├── backend/
│   ├── requirements.txt            # Python dependencies (fastapi, langgraph, sqlalchemy, fpdf2, yaml, etc.)
│   ├── llm_config.yaml             # Multi-LLM provider routing configuration
│   ├── db_schema_mapping.json      # Structured database schema details for Text-to-SQL injection
│   ├── seed_data.py                # Database seeding script (system data & 5 business tables)
│   ├── .env.example                # Environment variables template
│   └── app/
│       ├── __init__.py
│       ├── config.py               # Env/yaml configs loading & validation
│       ├── database.py             # SQLAlchemy setup and connection pool management
│       ├── models.py               # Database schemas for system and business tables
│       ├── schemas.py              # Pydantic schemas for API inputs/outputs
│       ├── auth.py                 # JWT token creation, hashing, cookie-based session dependency
│       ├── agent.py                # LangGraph state machine workflow nodes
│       ├── pdf_exporter.py         # PDF generation helper for chat histories
│       └── main.py                 # FastAPI main entrypoint, endpoints, and CORS config
├── frontend/
│   ├── package.json                # React & tool dependencies
│   ├── vite.config.js              # Vite compiler configuration
│   ├── index.html                  # HTML base frame
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                 # Dynamic router, layout framework, state provider
│       ├── index.css               # Clean typography, layout rules, CSS variables system
│       └── components/
│           ├── Header.jsx          # Top logo & user control avatar dropdown
│           ├── Sidebar.jsx         # New Chat, search bar, chronological list
│           ├── ChatCanvas.jsx      # Message bubbles, copy-to-clipboard, feedback triggers, latency metrics
│           ├── PromptDock.jsx      # Chat input dock and PDF export trigger
│           ├── FeedbackModal.jsx   # Feedback overlays
│           └── AdminPanel.jsx      # User directory, elevation, rule assignments
└── init.sql                        # Schema definition for PostgreSQL database
```

---

## Relational Database Schema Design

We will initialize the database using `init.sql` containing two groups of tables: **System Tables** (from the TRD) and **Business Data Tables** (to satisfy the 5-table dataset requirement).

### System Tables
1. `users`: System login, password hash, and core security level (`User` or `Admin`).
2. `rules`: Predicate SQL clauses (e.g. `geographic_region = 'US'`) mapped to role definitions.
3. `roles`: Name and description of user access levels (e.g. `US_Sales_Agent`).
4. `role_rules_mapping`: Maps rules to specific roles.
5. `user_roles_mapping`: Maps users to specific roles.
6. `chat_history`: Keeps history of chatbot conversations in JSONB format.
7. `feedback`: Relational logs of customer feedback responses.
8. `execution_log`: Telemetry logs tracking latency, tokens, status, and generated SQL queries.

### Business Data Tables (5 tables, seeded with >50 records each)
1. `customers`: User identity profile records including registration dates and region boundaries.
2. `products`: Enterprise items (name, pricing, inventory category).
3. `orders`: High-level order transaction details.
4. `order_items`: Line-level transactions tying products and orders together.
5. `reviews`: Product reviews containing scores and sentiment descriptions.

---

## Detailed Implementation Phases

### Phase 1: Database Schema & Seeding (Backend)
- Write `init.sql` containing all table schemas (system roles/data, and business tables).
- Create `backend/seed_data.py`:
  - Run schema creation.
  - Insert initial role settings (`Admin` role, `US_Only` role, etc.).
  - Generate and seed mock data:
    - 50+ customers across `US`, `EMEA`, `APAC` regions with registration dates.
    - 50+ products in categories (e.g., Electronics, Apparel, Home Office).
    - 50+ orders spanning the past 60 days.
    - 100+ order line items.
    - 50+ customer reviews.
  - Create a default admin user (`admin` / password: `adminpassword`) and standard user (`user` / password: `userpassword`) for immediate testing.

### Phase 2: Configurations & FastAPI Base Setup (Backend)
- Implement `backend/requirements.txt` and `.env.example`.
- Implement `backend/llm_config.yaml` to govern model configurations.
- Create `backend/app/config.py` to load environment variables and validate `llm_config.yaml` (erroring if multiple or zero models are set as active).
- Set up database connection utilities in `backend/app/database.py`.
- Define models in `backend/app/models.py`.
- Develop `backend/app/auth.py` utilizing cookie-stored JWT sessions.

### Phase 3: LangGraph Stateful Machine Workflow (Backend)
- Create `backend/db_schema_mapping.json` outlining the 5 business tables.
- Build the LangGraph workflow inside `backend/app/agent.py`:
  - **State definition**: Holds user question, extracted database rules, generated SQL query, execution rows, latency timers, and final response message.
  - **Node 1: Guardrail Inspection**: Analyzes question for system safety or out-of-scope tasks.
  - **Node 2: RBAC Injection**: Looks up user roles from db, loads predicate rules, and appends them to prompt instructions.
  - **Node 3: Text-to-SQL**: Calls active LLM to output clean, single SQL `SELECT` statements.
  - **Node 4: SQL Validator**: Asserts statement contains only SELECT, blocks formatting keywords (`DROP`, `INSERT`, etc.), and sanitizes input.
  - **Node 5: Query Execution**: Interacts with the db connection pool to fetch results.
  - **Node 6: Comprehensive Synthesis**: Synthesizes rows into formatted response markdown (bolding values and styling tables).
- Implement telemetry logger writing performance records to `execution_log`.

### Phase 4: PDF Exporter & API Endpoints (Backend)
- Implement `backend/app/pdf_exporter.py` (compiling chat logs to PDF document bytes using a clean formatting library).
- Write `backend/app/main.py` routing API endpoints for registration, authentication, chat management, messages (LangGraph processor), feedback logging, and PDF exporting.

### Phase 5: CSS Design System & Theme Layout (Frontend)
- Initialize the frontend project utilizing Vite React.
- Design `frontend/src/index.css` focusing on high-end design aesthetics:
  - Custom design tokens for colors, grids, heights, and shadows.
  - Theme toggler classes mapping CSS variables cleanly (`--bg-primary`, `--text-primary`, `--bg-secondary`, `--accent-color`).
  - Table wrapper styles supporting `overflow-x: auto` for wide columns.
  - Typography setup (e.g. Google Font Inter/Outfit).

### Phase 6: React Components & SPA Dashboard (Frontend)
- Implement Authentication Split View component for Registration/Login with inline password validation.
- Construct the core workspace dashboard:
  - Scrollable left sidebar with history lists and filter search field.
  - Custom top header housing user dropdown options.
  - Responsive chat canvas presenting message bubbles, latency tags, custom copy controls, and thumbs up/down modal dialog triggers.
  - Dynamic responsive prompt dock.
- Develop Admin Panel viewport containing lists of users, admin promotion commands, role lists, and rule definitions.

---

## Verification Plan

### Automated Tests
We will write a test suite using `pytest` to verify the critical backend routes and security guardrails:
- **LLM Configuration boot check**: Ensures server crashes if active configurations are invalid.
- **Authentication pipeline**: Tests registration rules (5-20 characters limit) and JWT cookie auth.
- **SQL Guardrails**: Direct tests asserting that malicious prompts (SQL injection attempts) or write commands (`DROP`, `DELETE`) are successfully blocked.
- **Query generation execution**: Verifies successful natural language translations on seeded tables.

### Manual Verification
- Deploy and launch Vite dev server and FastAPI server.
- Run database seeding and log in using seeded admin/user credentials.
- Test interface aesthetics, Dark/Light mode theme switching, side scrollable containers, and search filters.
- Run database queries: e.g. "Show total sales inside US region" to verify RBAC rules are injected and parsed successfully.
- Verify Thumbs-up/down modal overrides.
- Export chat session logs to check generated PDF layout.
