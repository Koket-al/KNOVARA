import React from "react";

export function Badge({ children, variant = "blue", className = "", ...props }) {
  const variantClass = `knovara-badge-${variant}`;
  return (
    <span className={`knovara-badge ${variantClass} ${className}`} {...props}>
      {children}
    </span>
  );
}

