// Ponto de entrada do app: monta o React no <div id="root"> do index.html
// e carrega o CSS global. StrictMode ajuda a flagrar efeitos colaterais em dev.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
