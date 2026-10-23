
type AppPage =
  | "overview"
  | "stock-analysis"
  | "portfolio-analysis"
  | "ai-analysis"
  | "data-status";

type SidebarProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
};

const navigationItems: {
  label: string;
  page: AppPage;
  icon: string;
}[] = [
  { label: "Overview", page: "overview", icon: "◫ " },
  { label: "Stock Analysis", page: "stock-analysis", icon: "↗ " },
  { label: "Portfolio Analysis", page: "portfolio-analysis", icon: "◈ " },
  { label: "AI Analysis", page: "ai-analysis", icon: "✳ " },
  { label: "Data Status", page: "data-status", icon: "▤ " },
];

export default function Sidebar({
  activePage,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">M</div>
        <div>
          <h2>MarketLens</h2>
          <span>MARKET INTELLIGENCE</span>
        </div>
      </div>

      <p className="nav-heading">WORKSPACE</p>

      <nav className="navigation" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <button
            key={item.page}
            type="button"
            className={`nav-item${
              activePage === item.page ? " active" : ""
            }`}
            onClick={() => onNavigate(item.page)}
            aria-current={
              activePage === item.page ? "page" : undefined
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <span className="status-dot" />
        <div>
          <strong>Market data workspace</strong>
          <p>PostgreSQL · FastAPI</p>
        </div>
      </div>
    </aside>
  );
}
