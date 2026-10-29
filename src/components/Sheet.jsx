import { useLayer, useDepth } from "../hooks";
import { isTelegram } from "../telegram";
import Icon from "./Icon";

/*
  variant="page"   – full-screen pushed page (workout, program, food search)
  variant="bottom" – bottom sheet for short forms and menus
  Inside Telegram the native BackButton closes it; in a browser a close button is shown.
*/
export default function Sheet({ title, subtitle, onClose, variant = "page", headerRight, children, className = "" }) {
  const depth = useDepth();
  useLayer(depth, onClose);

  if (variant === "bottom") {
    return (
      <div className="sheet-backdrop" style={{ zIndex: 100 + depth }} onClick={onClose}>
        <div
          className={`sheet-bottom ${className}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-grabber" />
          {(title || headerRight) && (
            <div className="sheet-bottom-header">
              <div>
                {subtitle && <p className="eyebrow">{subtitle}</p>}
                {title && <h2>{title}</h2>}
              </div>
              {headerRight}
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`sheet-page ${className}`} style={{ zIndex: 100 + depth }} role="dialog" aria-modal="true" aria-label={title}>
      <header className="sheet-page-header">
        {!isTelegram && (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Назад">
            <Icon name="back" />
          </button>
        )}
        <div className="sheet-page-title">
          {subtitle && <p className="eyebrow">{subtitle}</p>}
          {title && <h2>{title}</h2>}
        </div>
        {headerRight}
      </header>
      <div className="sheet-page-body">{children}</div>
    </div>
  );
}
