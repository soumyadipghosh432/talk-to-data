# 🛠️ Manual Installation & Technical Transition Guide

This document outlines the step-by-step process to set up, configure, and execute the **Talk-to-Data** application on a new machine. It also provides developer manuals for switching core database layers and LLM providers.

---

## 📋 1. Prerequisites & Installation

To run this project, the target machine must have **Python 3.10+**, **Node.js 18+**, and **PostgreSQL** installed.

### A. Python Installation
1. Download the Python installer from the official website: [Python Downloads](https://www.python.org/downloads/).
2. Run the installer and **CRITICAL: Ensure the checkbox "Add Python to PATH" is ticked** before proceeding.
3. Verify the installation by opening a new terminal and running:
   ```bash
   python --version
   ```

### B. Node.js & npm Installation
1. Download the long-term support (LTS) installer from: [Node.js Downloads](https://nodejs.org/).
2. Proceed with the default installation settings.
3. Verify the installation in your terminal:
   ```bash
   node --version
   npm --version
   ```

### C. PostgreSQL Installation
1. Download PostgreSQL from [PostgreSQL Interactive Installer](https://www.postgresql.org/download/).
2. Install the database server and remember the password configured for the default `postgres` user (typically `admin` or `postgres`).
3. Ensure the service is running locally on the default port `5432`.

---

## 🚀 2. Step-by-Step Local Setup

### Step 2.1: Database Schema Creation
1. Open your terminal and connect to your local Postgres server using the command-line or a tool like PgAdmin.
2. Create a database named `postgres` (or your chosen target database name):
   ```sql
   CREATE DATABASE postgres;
   ```
3. Run the schema creation script [init.sql](file:///init.sql) against your database:
   ```bash
   psql -U postgres -d postgres -f init.sql
   ```

### Step 2.2: Backend Server Configuration
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```
3. Activate the virtual environment:
   * **Windows (PowerShell)**: `.venv\Scripts\Activate.ps1`
   * **Windows (CMD)**: `.venv\Scripts\activate.bat`
   * **macOS / Linux**: `source .venv/bin/activate`
4. Install all python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Create a file named **`.env`** in the `backend/` directory and populate it with the following configuration details:
   ```env
   # Database connection string: postgresql://username:password@host:port/database
   DATABASE_URL=postgresql://postgres:admin@localhost:5432/postgres

   # JWT secret key for signing user sessions
   JWT_SECRET=super_secret_jwt_signing_key_change_me_in_production
   JWT_ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=1440

   # API Keys for AI models
   GOOGLE_GEMINI_KEY=YOUR_GEMINI_API_KEY_HERE
   OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
   ```

### Step 2.3: Database Seeding
With your virtual environment active and the `.env` file set up, execute the seed script to create initial tables, restriction rules, admin/user profiles, and over 50+ mock transaction logs:
```bash
python seed_data.py
```
* **Default Admin Account**: `admin` / `adminpassword`
* **Default Sales User Account**: `user` / `userpassword` *(restricted to geographic_region = 'US')*

### Step 2.4: Start Backend Gateway
Start the FastAPI server using Uvicorn:
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
The API is active at [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

### Step 2.5: Frontend Setup & Running
1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install all node packages:
   ```bash
   npm install
   ```
3. Start the local Vite development server:
   ```bash
   npm run dev
   ```
4. Access the web interface in your browser at [http://localhost:5173/](http://localhost:5173/).

### Step 2.6: Alternative Quick Launch (Windows run.bat)
For Windows users, we have provided a quick-start script **[run.bat](file:///run.bat)** in the project root folder. Running this batch script automatically:
* Opens a separate terminal window and launches the FastAPI backend.
* Waits 3 seconds for database connectivity and config caches to load.
* Opens another terminal window and launches the Vite React frontend client.
This allows you to spin up the entire local workspace with a single double-click.

---

## 🔑 3. LLM API Key Configuration

To get a Gemini API Key:
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click on **"Get API Key"** and create a new key.
4. Copy the key and replace `YOUR_GEMINI_API_KEY_HERE` in your `backend/.env` file.

---

## 🔄 4. Technology Switch Guides

This section documents how to modify database layers and LLM models without breaking existing execution logic.

### A. Database Transition (Local PostgreSQL ──► AWS RDS PostgreSQL)

To move the database layer to a managed production database on AWS:

#### Step 1: Network Ingress Setup
1. Create your PostgreSQL database instance in the AWS RDS console.
2. In the VPC Security Group assigned to the RDS instance, add an **Inbound Rule**:
   * **Type**: PostgreSQL
   * **Port**: 5432
   * **Source**: The Security Group of your backend application server (or your developer IP address for local testing).

#### Step 2: Connection String Update (`.env`)
Modify the `DATABASE_URL` key inside `backend/.env` to point to the remote RDS endpoint and enforce SSL traffic:
```env
DATABASE_URL=postgresql://db_user:db_password@rds-instance-endpoint.crw378y.us-east-1.rds.amazonaws.com:5432/db_name?sslmode=require
```

#### Step 3: Migration Execution
Run the initialization schema and the seeding script against the RDS endpoint:
```bash
# 1. Build schemas and triggers
psql -h rds-instance-endpoint.crw378y.us-east-1.rds.amazonaws.com -U db_user -d db_name -f init.sql

# 2. Run seed script
python seed_data.py
```

---

### B. LLM Transition (Google Gemini ──► AWS Bedrock Claude Sonnet)

Modern LangChain integrations have moved AWS Bedrock support out of the legacy `langchain-community` package and into a dedicated partner package called **`langchain-aws`**. This package natively implements the latest AWS APIs (such as the Anthropic Claude Messages API) and offers superior performance.

To switch the active model pipeline to **AWS Bedrock Claude Sonnet (us-east-1)**, follow these steps:

#### Step 1: Install partner package
Install the AWS Bedrock integration library in your virtual environment:
```bash
pip install langchain-aws
```
*(Alternatively, append `langchain-aws>=0.1.0` to your `backend/requirements.txt` file and run `pip install -r requirements.txt`).*

#### Step 2: Update Configuration Profile (`backend/llm_config.yaml`)
Disable Gemini and activate Bedrock:
```yaml
# backend/llm_config.yaml
gemini_model: "gemini-2.5-flash-lite"

models:
  - name: "OPENAI_API"
    active: false
  - name: "GOOGLE_GEMINI_API"
    active: false
  - name: "AWS_BEDROCK_CLAUDE"
    active: true
```

#### Step 3: Inject Provider Initialization (`backend/app/agent.py`)
Add the import and constructor logic for `AWS_BEDROCK_CLAUDE` inside the model builder function.

1. **Locate the constructor file**:
   Open [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) and locate the helper function `initialize_active_language_model()`.
2. **Add the import**:
   At the top of the file, import the native ChatBedrock wrapper:
   ```python
   from langchain_aws import ChatBedrock
   ```
3. **Add the Bedrock Clause**:
   Implement the constructor branch to instantiate the Bedrock client (this code example shows how to configure it):
   ```python
   # In backend/app/agent.py inside initialize_active_language_model():
   elif target_llm == "AWS_BEDROCK_CLAUDE":
       # Automatically loads credentials from environment variables (.env)
       return ChatBedrock(
           model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
           region_name="us-east-1",
           model_kwargs={"temperature": 0.0}
       )
   ```


#### Step 4: Configure AWS Credentials in `.env`
Add AWS authentication environment variables to the backend environment configurations:
```env
# AWS IAM Session Access Keys
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION=us-east-1
```
Ensure that the IAM user bound to these keys has the `AmazonBedrockFullAccess` policy (or `InvokeModel` permissions for the Claude Sonnet model ID) activated in AWS.

---

### C. Database Dialect Switch (Postgres ──► MySQL / AWS RDS MySQL)

If you migrate the database repository from PostgreSQL to a MySQL-based database (e.g. AWS RDS MySQL), you must adjust the backend SQL compiler settings and connection driver to accommodate dialect variations:

#### Step 1: Install MySQL Driver
Install the Python MySQL client libraries inside your virtual environment:
```bash
pip install pymysql
```

#### Step 2: Update Connection String in `.env`
Change the database schema scheme in `.env` to reference the MySQL driver (`pymysql`):
```env
DATABASE_URL=mysql+pymysql://db_user:db_password@rds-mysql-endpoint:3306/db_name
```

#### Step 3: Update LLM Text-to-SQL Instructions (`backend/app/agent.py`)
Because the agent prompt is configured for PostgreSQL syntax, update references inside the `system_prompt` in `backend/app/agent.py`:
1. **Change Dialect Name**: Open [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) and change `"PostgreSQL"` references in the `system_prompt` to `"MySQL 8.0+"`.
2. **Add Syntax Rules**: Add instructions to the prompt to guide the model on MySQL dialect rules:
   * Use `CONCAT()` instead of `||` for string concatenation.
   * Use standard MySQL date math (`NOW() - INTERVAL 30 DAY`) instead of PostgreSQL intervals (`INTERVAL '30 days'`).
   * Use default case-insensitive `LIKE` lookups instead of PostgreSQL `ILIKE`.

---

### D. Database Dialect Switch (Postgres ──► AWS Redshift)

If you migrate your database repository to Amazon Redshift (OLAP data warehouse), you must adjust the backend driver and prompt guidelines:

#### Step 1: Install Redshift Driver
Install the SQLAlchemy Redshift dialect package along with the PostgreSQL client library inside your virtual environment:
```bash
pip install sqlalchemy-redshift psycopg2-binary
```

#### Step 2: Update Connection String in `.env`
Update the database connection string to target the Redshift cluster endpoint and its default port (`5439`):
```env
DATABASE_URL=redshift+psycopg2://db_user:db_password@redshift-cluster-endpoint:5439/db_name
```

#### Step 3: Update LLM Text-to-SQL Instructions (`backend/app/agent.py`)
Amazon Redshift is built on a PostgreSQL 8.0.2 fork, which means it natively supports many standard PostgreSQL features (such as string concatenation `||` and case-insensitive pattern matching `ILIKE`). However, to prevent queries from failing:
1. **Change Dialect Name**: Open [agent.py](file:///c:/Users/Roni/Documents/GitHub/talk-to-data/backend/app/agent.py) and change `"PostgreSQL"` references in the `system_prompt` to `"Amazon Redshift"`.
2. **Unsupported Features Warning**: Add a rule to the prompt instructing the model to avoid PostgreSQL-specific features not supported by Redshift (such as recursive CTEs, standard `SERIAL` types, and complex spatial or XML functions).


