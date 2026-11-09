import React, { useEffect } from "react";

export function Modal({ isOpen, onClose, title, children, footer, maxWidth = "600px" }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(28, 25, 23, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className="knovara-card"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        <div
          className="flex-between"
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--knovara-border)",
            backgroundColor: "var(--knovara-surface)",
          }}
        >
          <h3 style={{ fontSize: "1.2rem", margin: 0 }}>{title}</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "1.5rem",
                color: "var(--knovara-text-secondary)",
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          )}
        </div>

        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--knovara-border)",
              backgroundColor: "var(--knovara-surface-card)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

