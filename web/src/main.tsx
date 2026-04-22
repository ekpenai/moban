import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'
import MobileEditorPixelMock from './components/MobileEditorPixelMock.tsx'

const params = new URLSearchParams(window.location.search)
const isMobileUiDemo = params.get('demo') === 'mobile-ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMobileUiDemo ? (
      <MobileEditorPixelMock />
    ) : (
      <>
        <App />
        <Toaster position="bottom-right" />
      </>
    )}
  </StrictMode>,
)
