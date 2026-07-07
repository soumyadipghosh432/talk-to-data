# Talk-to-Data BI Chatbot Setup Guide

This repository contains the complete implementation of the **Talk-to-Data** enterprise AI business intelligence assistant. The application consists of a **FastAPI backend** (orchestrated with LangGraph and PostgreSQL) and a modern **Vite React frontend SPA**.

Follow this guide to set up, configure, and execute the project on a new machine.

---

## 🛠️ Prerequisites
Make sure the following software is installed on the laptop:
1. **Node.js** (v18.0.0 or higher) & **npm**
2. **Python** (v3.10 or higher)
3. **PostgreSQL** (running locally on port `5432`)

---

## 🗄️ Step 1: Database Setup

1. Open your PostgreSQL terminal (`psql`) or management interface (like pgAdmin) and connect to your local database server.
2. Create a target database named `postgres` (or use your preferred database name):
   ```sql
   CREATE DATABASE postgres;
   ```
3. Initialize the schema structure, tables, triggers, and indices by executing the [init.sql](file:///init.sql) script in the root directory:
   ```bash
   psql -U postgres -d postgres -f init.sql
   ```
   *(Note: This configures the telemetry log tables, user tables, role mapping schemas, and the 5 business data tables).*

---

## ⚙️ Step 2: Backend Setup & Seeding

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a Python virtual environment:
   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:
   * **Windows (PowerShell)**:
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   * **Windows (Command Prompt)**:
     ```cmd
     .venv\Scripts\activate.bat
     ```
   * **macOS / Linux**:
     ```bash
     source .venv/bin/activate
     ```

4. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

5. Create a **`.env`** configuration file inside the `backend/` directory with the following variables:
   ```env
   # PostgreSQL Connection Link
   # Format: postgresql://username:password@host:port/database_name
   DATABASE_URL=postgresql://postgres:admin@localhost:5432/postgres

   # JWT Auth Signing Keys (Change secret in production)
   JWT_SECRET=super_secret_jwt_signing_key_change_me_in_production
   JWT_ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=1440

   # API Keys for AI Engines
   GOOGLE_GEMINI_KEY=YOUR_ACTUAL_GEMINI_API_KEY_HERE
   OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
   ```

6. Seed the database with the core rules, role limits, and **at least 50 sample business records per table** by executing the seed script:
   ```bash
   python seed_data.py
   ```
   *This inserts mock metrics (70 customers, 51 products, 85 orders, 100+ order line items, 60 product reviews) and prepares two default profiles:*
   * **Admin Profile**: User `admin` / Password `adminpassword`
   * **Sales User Profile**: User `user` / Password `userpassword` (restricted to US geographic region)

---

## 🖥️ Step 3: Frontend Setup

1. Open a new terminal window and navigate to the frontend folder:
   ```bash
   cd frontend
   ```

2. Install the Node modules:
   ```bash
   npm install
   ```

3. Launch the Vite local dev server:
   ```bash
   npm run dev
   ```
   *By default, the React interface will be served at [http://localhost:5173/](http://localhost:5173/).*

---

## 🚀 Step 4: Running the App

To test the application locally:
1. Ensure the PostgreSQL service is running on your machine.
2. Activate your backend virtual environment and start the FastAPI uvicorn server:
   ```bash
   cd backend
   .venv\Scripts\activate
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
3. Open [http://localhost:5173/](http://localhost:5173/) in your web browser.
4. Log in using `user` / `userpassword` or `admin` / `adminpassword` and begin questioning your dataset!

---

## 🔄 Model Configurations & Switching

We configured the model pipeline to dynamically load settings from [llm_config.yaml](file:///backend/llm_config.yaml) in the backend directory. 

To switch Google Gemini models or transition between providers:
1. Open [llm_config.yaml](file:///backend/llm_config.yaml) in a text editor.
2. Edit the **`gemini_model`** value to target your desired configuration:
   ```yaml
   # llm_config.yaml
   gemini_model: "gemini-2.5-flash-lite"
   ```
3. Supported and tested options:
   * **`gemini-2.5-flash-lite`** (Recommended: **1s latency**, active free-tier quota).
   * **`gemini-3.1-flash-lite`** (Good fallback: **2s latency**, active free-tier quota).
   * **`gemini-3.5-flash`** (High reasoning preview, subject to temporary high demand limits).
   * **`gemini-2.5-flash`** (Free tier limit: 20 queries/day).
   * **`gemini-2.0-flash`** (Free tier limit: 0 unless Google Cloud billing is linked).
4. Restart the FastAPI backend process to reload changes.
