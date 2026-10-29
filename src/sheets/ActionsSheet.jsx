import Sheet from "../components/Sheet";
import { useUi } from "../useStore";

export default function ActionsSheet({ sheetKey, title, subtitle, actions }) {
  const { closeSheet } = useUi();
  return (
    <Sheet variant="bottom" title={title} onClose={() => closeSheet(sheetKey)}>
      {subtitle && <p className="muted sheet-subtitle">{subtitle}</p>}
      <div className="action-list">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.destructive ? "destructive" : ""}
            onClick={() => {
              closeSheet(sheetKey);
              action.onClick();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
