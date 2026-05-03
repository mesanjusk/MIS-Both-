import { useEffect, useRef } from "react";

export default function Modal({ onClose, children, title }) {
  const contentRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;

      const focusable = contentRef.current?.querySelectorAll(
        'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    setTimeout(() => {
      const first = contentRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus?.();
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex justify-center items-center z-[70]"
      aria-modal="true"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className="bg-white rounded-2xl p-4 md:p-6 w-full max-w-4xl mx-3 relative max-h-[90vh] overflow-y-auto focus:outline-none shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
          <button
            className="ml-auto text-2xl leading-none text-slate-400 hover:text-indigo-500"
            onClick={onClose}
            aria-label="Close"
            type="button"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
