import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { installFx } from './lib/fx'
import { unlockOnFirstGesture } from './lib/sound'

unlockOnFirstGesture() // before installFx so the very first click is audible
installFx()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
