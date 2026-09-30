import React from 'react'
import { createRoot } from 'react-dom/client'
import './i18n.jsx' // Imports and initializes i18n translations
import App from './App.jsx'
import './styles.css'

// Error Boundary to display the crash reason directly on screen if React fails
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#ff4d4f', backgroundColor: '#1a1a1a', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2>⚠️ App Render Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#000', padding: 12, borderRadius: 6 }}>
            {this.state.error?.toString()}
          </pre>
          <p style={{ color: '#ccc' }}>Check your browser console for the full stack trace.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
