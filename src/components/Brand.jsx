import React from "react";
import { Link } from "react-router-dom";

export function BrandMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 2.5 35 11v18L20 37.5 5 29V11L20 2.5Z" stroke="#0066FF" strokeWidth="1.6" />
      <path
        d="M20 9.5 29 14.6v10.8L20 30.5l-9-5.1V14.6L20 9.5Z"
        fill="#0066FF"
        fillOpacity="0.12"
        stroke="#06B6D4"
        strokeWidth="1.2"
      />
      <circle cx="20" cy="20" r="3.2" fill="#06B6D4" />
      <path d="M20 9.5V16.8M29 25.4l-6.2-3.6M11 25.4l6.2-3.6" stroke="#06B6D4" strokeWidth="1.2" />
      <path
        d="M33 4.5h3.5V8M36.5 32v3.5H33M7 35.5H3.5V32M3.5 8V4.5H7"
        stroke="#8B5CF6"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export default function Brand({ to = "/", compact = false, size }) {
  return (
    <Link to={to} className={`brand${compact ? " compact" : ""}`} aria-label="Digital Twin Cyber War home">
      <span className="brand-mark">
        <BrandMark size={size || (compact ? 30 : 36)} />
      </span>
      <span className="brand-text">
        <span className="brand-name">
          DIGITAL TWIN <span>CYBER WAR</span>
        </span>
        {!compact && <span className="brand-sub">Powered by HUNTER AI</span>}
      </span>
    </Link>
  );
}
