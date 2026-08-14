# LinawLetra Frontend

React + Tailwind CSS frontend for the LinawLetra platform.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a gitignored `.env.local` file for local web development:
```
REACT_APP_API_URL=http://localhost:5002/api
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

This project uses Create React App, so browser-exposed frontend variables must use the `REACT_APP_*` prefix. Do not put `SUPABASE_SERVICE_ROLE_KEY` in any frontend `.env` file.

### 3. Start Development Server
```bash
npm start
```

