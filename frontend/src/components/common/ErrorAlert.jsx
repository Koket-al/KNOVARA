import React from "react";

export function ErrorAlert({ message, code, details, onDismiss, className = "" }) {
  if (!message) return null;

  return (
    <div className={`knovara-alert knovara-alert-danger ${className}`} role="alert">
      <div className="flex-between">
        <div>
          <strong>Error: </strong>
          <span>{message}</span>
          {code && (
            <div style={{ marginTop: "4px" }}>
              <code style={{ fontSize: "0.75rem" }}>Code: {code}</code>
            </div>
          )}
          {details && (
            <div style={{ marginTop: "4px", fontSize: "0.8125rem", opacity: 0.9 }}>
              {typeof details === "string" ? details : JSON.stringify(details)}
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss alert"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.25rem",
              lineHeight: 1,
              color: "inherit",
              padding: "4px 8px",
            }}
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

