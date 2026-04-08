# Client Architecture

## Overview

UroAssist frontend is a React single-page application (SPA) that provides a chat-based interface for healthcare providers to query patient medical information using AI.

- **Framework:** React 19
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS 4
- **Routing:** React Router DOM 7
- **HTTP Client:** Axios
- **Deployment:** AWS S3 + CloudFront

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Browser                                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         React Application                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                        App.jsx                                 │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                   AuthProvider                           │ │  │
│  │   │   (MSAL + session; see AuthContext)                      │ │  │
│  │   │                                                          │ │  │
│  │   │   ┌─────────────────────────────────────────────────┐   │ │  │
│  │   │   │              React Router                        │   │ │  │
│  │   │   │                                                  │   │ │  │
│  │   │   │   /login ──────► LoginPage                       │   │ │  │
│  │   │   │                                                  │   │ │  │
│  │   │   │   / ──────► ProtectedRoute ─► DashboardLayout   │   │ │  │
│  │   │   │              │                                 │   │ │  │
│  │   │   │              ├─ / (index) ──► MainApp (chat)      │   │ │  │
│  │   │   │              ├─ /schedule ─ PractitionerSchedule│   │ │  │
│  │   │   │              ├─ /call-schedule-admin (admin)   │   │ │  │
│  │   │   │              └─ /call-schedule-change-log (adm)│   │ │  │
│  │   │   └─────────────────────────────────────────────────┘   │ │  │
│  │   └─────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                         Services                               │  │
│  │   apiClient.js ──► authService.js, patientService.js,          │  │
│  │   scheduleService.js, callScheduleService.js                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    │ HTTPS (Axios, Bearer token)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Backend API (FastAPI)                             │
│                   https://api.uroassist.net (production)             │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
client/
├── public/                     # Static assets (served as-is)
│   ├── logo.png               # Application logo
│   └── vite.svg               # Vite favicon
├── src/
│   ├── main.jsx               # Application entry point
│   ├── App.jsx                # Routes: login, dashboard shell, nested pages
│   ├── authConfig.js          # MSAL config (Entra client, redirect URIs, admin role)
│   ├── msalInstance.js        # MSAL PublicClientApplication singleton
│   ├── index.css              # Global styles (Tailwind)
│   ├── assets/                # Bundled assets
│   │   └── react.svg
│   ├── components/            # React components
│   │   ├── LoginPage.jsx
│   │   ├── DashboardLayout.jsx    # Shell + nav for authenticated area
│   │   ├── MainApp.jsx          # Clinical assistant (chat + patient search)
│   │   ├── PractitionerSchedule.jsx
│   │   ├── CallScheduleAdmin.jsx
│   │   ├── CallScheduleChangeLog.jsx
│   │   └── ProtectedRoute.jsx     # Auth / optional requireAdmin
│   ├── config/
│   │   └── api.js             # API base URL and timeouts
│   ├── context/
│   │   └── AuthContext.jsx    # MSAL account + derived user (e.g. is_admin)
│   ├── services/
│   │   ├── apiClient.js
│   │   ├── authService.js     # /auth/me, /auth/logout
│   │   ├── patientService.js  # /patients, /run_crew
│   │   ├── scheduleService.js # /schedule (practitioner calendar)
│   │   └── callScheduleService.js  # /call-schedule (grid, upload, changelog)
│   └── utils/
│       └── calendarPacific.js
├── dist/                      # Production build output
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
├── CLIENT_DEPLOYMENT.md
└── CLIENT_ARCHITECTURE.md     # This file
```

## Core Components

### 1. App.jsx - Application Root

The root component configures **React Router** routes. **`AuthProvider`** wraps `<App />` in `main.jsx` (not in `App.jsx`).

Nested routes use `DashboardLayout` as the authenticated shell; `MainApp` is the default index route (`/`).

```jsx
<Router>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
      <Route index element={<MainApp />} />
      <Route path="schedule" element={<PractitionerSchedule />} />
      <Route path="call-schedule-admin" element={<ProtectedRoute requireAdmin><CallScheduleAdmin /></ProtectedRoute>} />
      <Route path="call-schedule-change-log" element={<ProtectedRoute requireAdmin><CallScheduleChangeLog /></ProtectedRoute>} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
</Router>
```

(`AuthProvider` wraps the tree in `main.jsx`.)

### 2. AuthContext.jsx - Authentication State

Manages authentication state globally using **Microsoft Entra** via **MSAL** (`@azure/msal-react`):

| State | Type | Description |
|-------|------|-------------|
| `user` | Object \| null | Derived from active MSAL account (name, username, `is_admin` from ID token `roles`) |
| `account` | Account \| null | Active MSAL account |
| `loading` | Boolean | MSAL interaction in progress |
| `isAuthenticated` | Boolean | Whether an MSAL account is active |

API calls attach tokens through `apiClient` → `getAuthHeaders()` (MSAL-acquired token used as `Authorization: Bearer ...` for the backend).

### 3. LoginPage.jsx - Authentication UI

Features:
- **Sign in with Microsoft** (MSAL redirect or popup flow per app configuration)
- Loading and error handling while MSAL completes

### 4. ProtectedRoute.jsx - Route Guard

Protects routes that require authentication:
- Shows loading spinner while checking auth
- Redirects to `/login` if not authenticated
- Renders children if authenticated
- Optional `requireAdmin`: redirect non-admins (checks `user.is_admin` from `/auth/me` / ID token roles)

### 5. DashboardLayout.jsx - Authenticated shell

Wraps nested routes with shared navigation (e.g. links to chat, practitioner schedule, call schedule admin for admins).

### 6. MainApp.jsx - Clinical assistant

Default route (`/`). Main sections:

**Patient search (left):** autocomplete, patient list, selection.

**Chat (right):** messages, input, loading state for `/run_crew`.

### 7. Schedule-related pages

| Component | Route | API surface (via services) |
|-----------|-------|------------------------------|
| `PractitionerSchedule.jsx` | `/schedule` | `scheduleService` → `/schedule` |
| `CallScheduleAdmin.jsx` | `/call-schedule-admin` | `callScheduleService` → `/call-schedule`, `/call-schedule/week`, upload |
| `CallScheduleChangeLog.jsx` | `/call-schedule-change-log` | `callScheduleService.getChangelog` → `GET /call-schedule/changelog` (admin) |

## Services Layer

### apiClient.js - HTTP Client

Centralized Axios instance with:

**Request Interceptor:**
```javascript
// Automatically adds Bearer token to requests
config.headers.Authorization = `Bearer ${token}`;
```

**Response Interceptor:**
- Handles 401 errors (clears token, dispatches `auth:unauthorized` event)
- Handles network errors
- Handles 5xx server errors

**Retry Logic:**
- Retries failed requests up to 3 times
- Exponential backoff (1s, 2s, 3s)
- Only retries network errors and 5xx errors

### authService.js - Authentication API

| Method | Description |
|--------|-------------|
| `loginWithEntra()` | Start Entra sign-in via MSAL (`loginRedirect`) |
| `logout()` | POST `/auth/logout` (clears server-side cache; client should also MSAL sign-out) |
| `checkAuth()` | GET `/auth/me` — load profile with current bearer token |

### patientService.js - Patient API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `searchPatients(input)` | GET `/patients?given=…` / `family=…` | FHIR name search (typeahead) |
| `runCrew(data)` | POST `/run_crew` | Send AI query (`{ query, id }`) |

### scheduleService.js - Practitioner schedule

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getPractitionerSchedule(start, end)` | GET `/schedule` | Practitioner appointments for a date range |

### callScheduleService.js - On-call grid

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getCallSchedule(start, end)` | GET `/call-schedule` | On-call assignments for a range |
| `saveWeek(weekStart, days)` | POST `/call-schedule/week` | Save a week from the editor |
| `uploadSchedule(file)` | POST `/call-schedule/upload` | Import CSV/XLSX |
| `getChangelog(limit, offset)` | GET `/call-schedule/changelog` | Admin change log (newest first) |

## Data Flow

### Authentication Flow

```
1. User chooses Sign in with Microsoft on LoginPage
                    │
                    ▼
2. MSAL acquires tokens (redirect or interactive)
                    │
                    ▼
3. Active MSAL account set; AuthContext reflects user + roles
                    │
                    ▼
4. apiClient requests include Authorization: Bearer <token>
                    │
                    ▼
5. Backend validates Entra JWT and resolves ModMed session server-side
                    │
                    ▼
6. Navigate to MainApp (/) when authenticated
```

### Query Flow

```
1. User selects patient from search
                    │
                    ▼
2. User types question in chat input
                    │
                    ▼
3. patientService.runCrew({ query, id })
                    │
                    ▼
4. POST /run_crew with Bearer token
                    │
                    ▼
5. Server fetches patient data from ModMed
   Server embeds data in Qdrant
   Server runs AI crew analysis
                    │
                    ▼
6. Response displayed in chat as bot message
```

## Configuration

### Environment Variables

Vite exposes only variables prefixed with `VITE_`. Values are inlined at **build time**.

| Variable | Description | Typical local |
|----------|-------------|---------------|
| `VITE_API_URL` | Backend API base URL (no trailing slash unless the API is under a path prefix) | `http://localhost:8080` |
| `VITE_APP_ORIGIN` | SPA origin for MSAL defaults (`redirectUri` / post-logout when not overridden) | `http://localhost:5173` |
| `VITE_MSAL_REDIRECT_URI` | Optional override for Entra redirect URI (must match app registration) | — |
| `VITE_MSAL_POST_LOGOUT_URI` | Optional post sign-out redirect | — |
| `VITE_ADMIN_APP_ROLE` | Entra app role **value** for admins (must match API `ENTRA_ADMIN_APP_ROLE`) | `admin` |

**Files:** `.env.development`, `.env.production`. Production CI writes `.env.production` from GitHub Actions secrets (see `.github/workflows/deploy-frontend.yml`).

### API Configuration (config/api.js)

```javascript
const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  TIMEOUT: 35000,      // 35 seconds
  RETRY_ATTEMPTS: 3,   // Max retries
  RETRY_DELAY: 1000,   // 1 second base delay
};
```

## Styling

### Tailwind CSS

The application uses Tailwind CSS 4 for styling:
- Utility-first CSS framework
- No custom CSS files needed
- Responsive design with breakpoints (`lg:`, `sm:`)

### Design System

| Element | Style |
|---------|-------|
| Primary Color | Teal (`teal-600`, `teal-700`) |
| Background | Gray (`gray-50`) |
| Cards | White with shadow (`bg-white shadow`) |
| Buttons | Rounded with hover states |
| Form Inputs | Border with focus ring |

### Layout

- **Mobile:** Single column, stacked layout
- **Desktop (lg+):** 3-column grid (1/3 search, 2/3 chat)

## State Management

The application uses React's built-in state management:

### Global State (Context)
- **AuthContext:** User authentication state

### Local State (useState)
- **MainApp:** Patients list, selected patient, messages, search term
- **LoginPage:** MSAL interaction state, error, loading

### Side Effects (useEffect)
- Fetch patients on mount
- Filter patients on search term change
- Auto-scroll chat on new messages
- Close search results on outside click

## Security

### Token Management
- Tokens are managed by **MSAL** (browser cache/session storage per `msal` config)
- `apiClient` attaches `Authorization` via `getAuthHeaders()` on each request
- On `401`, the client dispatches `auth:unauthorized` (optional listeners; MSAL re-auth may be required)

### Protected Routes
- ProtectedRoute component guards authenticated pages
- Redirects to login if no valid session

### Event-Based Auth
- `auth:unauthorized` custom event is dispatched on 401 responses (see `apiClient.js`); wire a listener if you want global redirect to sign-in

## Build & Development

### Scripts

```bash
npm run dev      # Start development server (port 5173)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Build Output

Production build creates:
```
dist/
├── index.html           # Entry HTML (no-cache)
├── assets/
│   ├── index-[hash].js  # Bundled JavaScript
│   └── index-[hash].css # Bundled CSS
└── logo.png             # Static assets
```

### Optimization

Vite automatically:
- Tree-shakes unused code
- Minifies JavaScript and CSS
- Generates content hashes for cache busting
- Code-splits by route (if configured)

## Deployment

See [CLIENT_DEPLOYMENT.md](./CLIENT_DEPLOYMENT.md) for detailed deployment instructions.

**Infrastructure:**
- **Hosting:** AWS S3 (static files)
- **CDN:** AWS CloudFront (global distribution)
- **Domain:** uroassist.net
- **SSL:** AWS Certificate Manager

**CI/CD:**
- `.github/workflows/deploy-frontend.yml` — on push to `main` when `client/**` changes (or manual `workflow_dispatch`)
- Requires secrets: `VITE_API_URL`, `AWS_*`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`; optional `VITE_APP_ORIGIN`, `VITE_MSAL_*`, `VITE_ADMIN_APP_ROLE` (see workflow header comments)
- Sync to S3, long-cache assets, no-cache `index.html`, CloudFront invalidation `/*`

## Performance Considerations

### Caching Strategy
- **Assets (JS/CSS):** 1 year cache (immutable, hash in filename)
- **index.html:** No cache (always fetch latest)

### Loading States
- Spinner during auth check
- "Thinking..." indicator during AI queries
- Disabled inputs during loading

### Error Handling
- Network error messages
- API error display in chat
- Automatic retry for transient failures

