"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Edit panel next to the list, which stays visible (FR-015). Focus moves into the panel when it
 * opens and goes back to where it was when it closes; `Esc` closes it. On narrow screens it
 * covers the page (see `globals.css`).
 */
export function SidePanel({ title, onClose, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    heading.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <aside
      className="side-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="side-panel-title"
      onKeyDown={onKeyDown}
    >
      <div className="side-panel-head">
        <h2 id="side-panel-title" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
      {children}
    </aside>
  );
}
