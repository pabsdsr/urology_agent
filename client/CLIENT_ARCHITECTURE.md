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
│  │   │   (Context for authentication state)                     │ │  │
│  │   │                                                          │ │  │
│  │   │   ┌─────────────────────────────────────────────────┐   │ │  │
│  │   │   │              React Router                        │   │ │  │
│  │   │   │                                                  │   │ │  │
│  │   │   │   /login ──────► LoginPage                       │   │ │  │
│  │   │   │                                                  │   │ │  │
│  │   │   │   / ──────► ProtectedRoute ──────► MainApp      │   │ │  │
│  │   │   │                                                  │   │ │  │
│  │   │   └─────────────────────────────────────────────────┘   │ │  │
│  │   └─────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                         Services                               │  │
│  │   apiClient.js ──► authService.js ──► patientService.js       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    │ HTTPS (Axios)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Backend API (FastAPI)                             │
│                   https://api.uroassist.net                          │
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
│   ├── App.jsx                # Root component with routing
│   ├── index.css              # Global styles (Tailwind)
│   ├── assets/                # Bundled assets
│   │   └── react.svg
│   ├── components/            # React components
│   │   ├── LoginPage.jsx      # Authentication UI
│   │   ├── MainApp.jsx        # Main application interface
│   │   └── ProtectedRoute.jsx # Route guard component
│   ├── config/                # Configuration files
│   │   └── api.js             # API configuration
│   ├── context/               # React contexts
│   │   └── AuthContext.jsx    # Authentication state management
│   └── services/              # API service layer
│       ├── apiClient.js       # Axios instance with interceptors
│       ├── authService.js     # Authentication API calls
│       └── patientService.js  # Patient API calls
├── dist/                      # Production build output
├── index.html                 # HTML entry point
├── package.json               # Dependencies and scripts
├── vite.config.js             # Vite configuration
├── eslint.config.js           # ESLint configuration
├── CLIENT_DEPLOYMENT.md       # Deployment guide
└── CLIENT_ARCHITECTURE.md     # This file
```

## Core Components

### 1. App.jsx - Application Root

The root component that sets up:
- **AuthProvider:** Wraps the entire app with authentication context
- **React Router:** Handles client-side routing

```jsx
<AuthProvider>
  <Router>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <MainApp />
        </ProtectedRoute>
      } />
    </Routes>
  </Router>
</AuthProvider>
```

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

### 5. MainApp.jsx - Main Interface

The primary application interface with two main sections:

**Patient Search Panel (Left):**
- Search input with autocomplete
- Patient list dropdown
- Selected patient display

**Chat Interface (Right):**
- Message history display
- User and bot message bubbles
- Text input with Enter key support
- Loading indicator during AI processing

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

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8080` |

**Files:**
- `.env.development` - Local development
- `.env.production` - Production build

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
- GitHub Actions workflow (`.github/workflows/deploy-frontend.yml`)
- Triggered on push to `main` with changes in `client/`
- Automatic S3 sync and CloudFront invalidation

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

