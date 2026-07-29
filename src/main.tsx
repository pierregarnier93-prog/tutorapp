import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{padding:20,fontFamily:"monospace",color:"red",background:"#fff",minHeight:"100vh"}}>
        <h2>Erreur runtime : {(this.state.error as Error).message}</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:12}}>{(this.state.error as Error).stack}</pre>
      </div>
    );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
