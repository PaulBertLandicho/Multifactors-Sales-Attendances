import React from "react";
import "./icon.css";

export default function Icon({ as: IconComponent, size = 20, color, className = "", ariaLabel, style = {} }) {
  const role = ariaLabel ? "img" : "presentation";
  const props = {
    size,
    color,
    className: `modern-icon ${className}`.trim(),
    style,
    role,
  };
  if (ariaLabel) props["aria-label"] = ariaLabel;
  return <IconComponent {...props} />;
}
