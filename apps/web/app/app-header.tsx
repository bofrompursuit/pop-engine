import "./app-header.css";

// The one nav every route shares (landing through intake through the workflow tabs): brand
// centered, a menu affordance right. No per-page nav duplicated — this is the only copy.
export function AppHeader() {
  return (
    <header className="app-header">
      <span className="app-header__spacer" aria-hidden="true" />
      <span className="app-header__brand">POPENGINE</span>
      <button type="button" className="app-header__menu" aria-label="Menu">
        <span />
        <span />
        <span />
      </button>
    </header>
  );
}
