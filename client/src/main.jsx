import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'  // Make sure this line exists
import App from './App.jsx'
import { AuthProvider  } from './context/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
