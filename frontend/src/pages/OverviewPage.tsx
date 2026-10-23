type OverviewPageProps = {
  selectedStock: string;
  portfolioAssetCount: number;
  dataStatus: string;
  onNavigate: (
    page:
      | "stock-analysis"
      | "portfolio-analysis"
      | "ai-analysis"
      | "data-status"
  ) => void;
};

export default function OverviewPage({
  selectedStock,
  portfolioAssetCount,
  dataStatus,
  onNavigate,
}: OverviewPageProps) {
  return (
    <section className="overview-landing" aria-label="Workspace overview">
      <div className="welcome-row">
        <div>
          <h2>Your market intelligence workspace.</h2>
          <p>Choose an analysis workspace to continue.</p>
        </div>
      </div>

      <div className="analytics-grid overview-destination-grid">
        <article className="panel analytics-panel">
          <p className="eyebrow">MARKET RESEARCH</p>
          <h2>Stock Analysis</h2>
          <p className="analytics-description">
            Explore {selectedStock || "a selected stock"} price history,
            returns, risk, drawdowns, and benchmark performance.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate("stock-analysis")}
          >
            Open stock analysis
          </button>
        </article>

        <article className="panel analytics-panel">
          <p className="eyebrow">PORTFOLIO WORKSPACE</p>
          <h2>Portfolio Analysis</h2>
          <p className="analytics-description">
            Build a portfolio and evaluate performance, risk contributions,
            scenarios, backtests, and historical stress.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate("portfolio-analysis")}
          >
            Open portfolio analysis
          </button>
        </article>

        <article className="panel analytics-panel">
          <p className="eyebrow">AI RESEARCH</p>
          <h2>AI Analysis</h2>
          <p className="analytics-description">
            Use the stock analyst and portfolio analyst in a dedicated
            workspace.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate("ai-analysis")}
          >
            Open AI analysis
          </button>
        </article>

        <article className="panel analytics-panel">
          <p className="eyebrow">DATA OPERATIONS</p>
          <h2>Data Status</h2>
          <p className="analytics-description">
            Review stored market-data coverage, latest trading dates, and
            provider/database refresh status.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate("data-status")}
          >
            Open data status
          </button>
        </article>
      </div>

      <div className="panel analytics-panel overview-status">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CURRENT CONTEXT</p>
            <h2>Workspace snapshot</h2>
          </div>
        </div>

        <div className="risk-row">
          <div>
            <span>Selected instrument</span>
            <p>Open individual asset research</p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate("stock-analysis")}
          >
            {selectedStock || "Select a stock"} →
          </button>
        </div>

        <div className="risk-row">
          <div>
            <span>Portfolio holdings</span>
            <p>Assets configured in the portfolio builder</p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate("portfolio-analysis")}
          >
            {portfolioAssetCount} assets →
          </button>
        </div>

        <div className="risk-row">
          <div>
            <span>Market data status</span>
            <p>Check data freshness and refresh history</p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate("data-status")}
          >
            {dataStatus} →
          </button>
        </div>
      </div>
    </section>
  );
}
