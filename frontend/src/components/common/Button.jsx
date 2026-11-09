import React from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled = false,
  type = "button",
  onClick,
  className = "",
  ...props
}) {
  const variantClass = `knovara-btn-${variant}`;
  const sizeClass = size === "sm" ? "knovara-btn-sm" : size === "lg" ? "knovara-btn-lg" : "";

  return (
    <button
      type={type}
      className={`knovara-btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || isLoading}
      onClick={onClick}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="knovara-spinner-inline" aria-hidden="true" />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

