import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[KNOVARA ERROR BOUNDARY]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
          <div className="knovara-card" style={{ border: "1px solid var(--knovara-status-danger)", padding: "32px 24px" }}>
            <h2 style={{ fontSize: "1.35rem", marginBottom: "12px", color: "var(--knovara-status-danger)" }}>
              Something went wrong loading this component
            </h2>
            <p style={{ fontSize: "0.875rem", color: "var(--knovara-text-secondary)", marginBottom: "20px" }}>
              {this.state.error?.message || "An unexpected rendering error occurred."}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                type="button"
                className="knovara-btn knovara-btn-secondary"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Dismiss & Retry
              </button>
              <button
                type="button"
                className="knovara-btn knovara-btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

