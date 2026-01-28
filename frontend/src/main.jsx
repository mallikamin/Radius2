import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { jsPDF } from 'jspdf'

// Make jsPDF available globally
window.jspdf = { jsPDF }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
