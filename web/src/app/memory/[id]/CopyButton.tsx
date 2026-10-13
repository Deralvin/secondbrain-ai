"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export default function CopyButton({
  text,
  label = "Copy Solution",
  className = "button",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleCopy}
      title="Copy content to clipboard"
    >
      {copied ? (
        <>
          <span style={{ color: "var(--accent)" }}>✓</span> Copied!
        </>
      ) : (
        <>
          <span>📋</span> {label}
        </>
      )}
    </button>
  );
}
