# AI Data Cleaner

AI Data Cleaner is a full-stack CSV cleaning app with:

- a React + Vite frontend
- a FastAPI backend
- pandas-based dataset analysis and cleaning

Current MVP features:

- upload a CSV and analyze its structure
- detect missing values, duplicates, and date-like columns
- apply cleaning actions like dropping duplicates, dropping missing rows, filling custom values, and converting date columns
- edit preview cells inline
- undo, reset, and download the current cleaned CSV
- run backend and frontend tests

## Project structure

- `backend/`: FastAPI API and pandas cleaning logic
- `frontend/`: React UI built with Vite
- `run-tests.ps1`: runs backend and frontend tests in one command

## Backend setup

Create and activate a virtual environment if needed, then install dependencies:

```powershell
cd C:\Users\Winston\projects\ai-data-cleaner\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Start the API:

```powershell
cd C:\Users\Winston\projects\ai-data-cleaner\backend
.\venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend will run at `http://127.0.0.1:8000`.

## Frontend setup

Install dependencies:

```powershell
cd C:\Users\Winston\projects\ai-data-cleaner\frontend
npm install
```

Start the frontend:

```powershell
cd C:\Users\Winston\projects\ai-data-cleaner\frontend
npm run dev
```

The frontend will run at `http://localhost:5173`.

During local development, Vite proxies `/api/*` requests to the FastAPI backend.

## Running tests

Run everything:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Winston\projects\ai-data-cleaner\run-tests.ps1
```

Run backend tests only:

```powershell
cd C:\Users\Winston\projects\ai-data-cleaner\backend
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

Run frontend tests only:

```powershell
cd C:\Users\Winston\projects\ai-data-cleaner\frontend
npm.cmd test
```

## Current architecture

Backend:

- `backend/main.py` contains the FastAPI routes, response models, CSV parsing helpers, analysis logic, and cleaning actions.
- `backend/tests/test_main.py` covers API behavior, validation, response contracts, and smoke checks.

Frontend:

- `frontend/src/App.jsx` contains the current upload, issue-review, preview-editing, and download workflow.
- `frontend/src/App.test.jsx` covers key UI behavior and smoke checks.
- `frontend/vitest.config.mjs` configures the frontend test runner for this Windows environment.

## Next cleanup ideas

- split backend logic into route, schema, analysis, and cleaning modules
- improve user-facing validation and error messaging
- add visual highlighting for recently changed cells
- add broader CSV edge-case handling for larger or messier files
