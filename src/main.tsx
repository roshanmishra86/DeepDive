import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/newsreader'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/tokens.css'
import './index.css'
import './styles/chrome.css'
import './styles/inbox.css'
import './styles/todo.css'
import './styles/templates.css'
import App from './App.tsx'
import { updaterController } from './lib/updater.ts'

// Outside React so Strict Mode cannot create duplicate timers or checks.
void updaterController.initialize()
updaterController.startSchedule()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
