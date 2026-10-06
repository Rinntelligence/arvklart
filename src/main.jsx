import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { getLang } from './lib/lang'

if (getLang() === 'en') {
  document.documentElement.lang = 'en'
  document.title = 'Arvklart — Inheritance distribution made simpler'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter><App /></BrowserRouter>
)
