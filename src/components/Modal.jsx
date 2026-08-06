import { X } from "lucide-react";

export default function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
  bodyClassName = "",
  closeDisabled = false
}) {
  function requestClose() {
    if (!closeDisabled) onClose?.();
  }

  return (
    <div className="modal-layer" role="presentation" onMouseDown={requestClose}>
      <section
        className={`modal-card ${wide ? "wide" : ""} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={requestClose}
            aria-label="Close"
            disabled={closeDisabled}
          >
            <X size={22} />
          </button>
        </header>
        <div className={`modal-body ${bodyClassName}`.trim()}>{children}</div>
      </section>
    </div>
  );
}
