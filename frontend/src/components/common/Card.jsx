import React from "react";

export function Card({ children, title, subtitle, interactive = false, className = "", action, ...props }) {
  return (
    <div
      className={`knovara-card ${interactive ? "knovara-card-interactive" : ""} ${className}`}
      {...props}
    >
      {(title || subtitle || action) && (
        <div className="flex-between" style={{ marginBottom: "16px", borderBottom: "1px solid var(--knovara-border)", paddingBottom: "12px" }}>
          <div>
            {title && <h3 style={{ fontSize: "1.15rem", marginBottom: subtitle ? "4px" : "0" }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)" }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

