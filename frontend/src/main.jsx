import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Lazy-load jsPDF (code-split into vendor-pdf chunk)
// Components that need it (Sidebar, exportUtils) already handle dynamic import as fallback
import('jspdf').then(({ jsPDF }) => {
  window.jspdf = { jsPDF }
}).catch(() => {
  console.info('jsPDF will be loaded on-demand when needed')
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
