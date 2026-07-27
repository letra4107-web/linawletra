import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

if (/Android/i.test(window.navigator.userAgent)) {
  document.documentElement.classList.add('is-android');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
