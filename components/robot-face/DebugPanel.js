export function DebugPanel({ title, children, className = "" }) {
  return (
    <div className={`debug-panel ${className}`}>
      <p className="text-[0.7rem] uppercase tracking-[0.34em] text-[#4f7b6d]/85">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
