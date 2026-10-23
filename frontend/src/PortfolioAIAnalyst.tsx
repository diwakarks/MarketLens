
import { useState } from "react";

type PortfolioAIResponse = {
  question: string;
  portfolio: {
    tickers: string[];
    weights: Record<string, number>;
    start_date: string | null;
    end_date: string | null;
    portfolio_analytics: Record<string, unknown>;
    benchmark_comparison: Record<string, unknown>;
  };
  answer: string;
  disclaimer: string;
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function PortfolioAIAnalyst() {
  const [tickers, setTickers] = useState("TCS.NS, GROWW.NS");
  const [weights, setWeights] = useState("60, 40");
  const [question, setQuestion] = useState(
    "Explain my portfolio's risk and compare its performance with the NIFTY 50 benchmark"
  );
  const [initialValue, setInitialValue] = useState("100000");
  const [riskFreeRate, setRiskFreeRate] = useState("6.5");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<PortfolioAIResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAnalyst(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    const symbols = tickers
      .split(",")
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean);

    const percentages = weights
      .split(",")
      .map((weight) => Number(weight.trim()));

    if (!question.trim() || question.trim().length < 3) {
      setError("Enter a more specific question.");
      return;
    }

    if (
      symbols.length === 0 ||
      symbols.length !== percentages.length ||
      percentages.some((weight) => !Number.isFinite(weight) || weight < 0)
    ) {
      setError(
        "Enter one non-negative weight for every ticker, in the same order."
      );
      return;
    }

    if (new Set(symbols).size !== symbols.length) {
      setError("Each ticker must be unique.");
      return;
    }

    if (Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 0.01) {
      setError("Portfolio weights must add up to 100%.");
      return;
    }

    if (
      !Number.isFinite(Number(initialValue)) ||
      Number(initialValue) <= 0 ||
      !Number.isFinite(Number(riskFreeRate)) ||
      Number(riskFreeRate) < 0
    ) {
      setError("Enter a positive portfolio value and a non-negative risk-free rate.");
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("Start date must be on or before end date.");
      return;
    }

    const payload = {
      question: question.trim(),
      tickers: symbols,
      weights: percentages.map((weight) => weight / 100),
      initial_value: Number(initialValue),
      risk_free_rate: Number(riskFreeRate) / 100,
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
    };

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/ai/portfolio-ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "The Portfolio AI Analyst could not process the request."
        );
      }

      setResult(data as PortfolioAIResponse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to MarketLens. Check that the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel portfolio-ai-panel">
      <div className="portfolio-ai-header">
        <div>
          <p className="portfolio-ai-eyebrow">GEMINI-POWERED ANALYSIS</p>
          <h2>Portfolio AI Analyst</h2>
          <p>
            Ask questions about historical portfolio risk and benchmark
            performance using MarketLens-computed analytics.
          </p>
        </div>
      </div>

      <form onSubmit={askAnalyst} className="portfolio-ai-form">
        <label>
          Portfolio tickers
          <input
            value={tickers}
            onChange={(event) => setTickers(event.target.value)}
            placeholder="TCS.NS, GROWW.NS"
            required
          />
        </label>

        <label>
          Portfolio weights (%)
          <input
            value={weights}
            onChange={(event) => setWeights(event.target.value)}
            placeholder="60, 40"
            required
          />
        </label>

        <div className="portfolio-ai-fields">
          <label>
            Initial portfolio value
            <input
              type="number"
              min="0.01"
              step="any"
              value={initialValue}
              onChange={(event) => setInitialValue(event.target.value)}
              required
            />
          </label>

          <label>
            Annual risk-free rate (%)
            <input
              type="number"
              min="0"
              step="any"
              value={riskFreeRate}
              onChange={(event) => setRiskFreeRate(event.target.value)}
              required
            />
          </label>

          <label>
            Start date (optional)
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label>
            End date (optional)
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>

        <label>
          Ask MarketLens
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={1000}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Analyzing portfolio…" : "Analyze portfolio"}
        </button>
      </form>

      {error && (
        <div className="portfolio-ai-error" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <p role="status">Computing portfolio analytics and requesting Gemini analysis…</p>
      )}

      {result && (
        <div className="portfolio-ai-result" aria-live="polite">
          <h3>Analyst explanation</h3>
          <p className="portfolio-ai-answer">{result.answer}</p>

          <details>
            <summary>View computed portfolio context</summary>
            <h4>Portfolio analytics</h4>
            <pre>
              {JSON.stringify(
                result.portfolio.portfolio_analytics,
                null,
                2
              )}
            </pre>

            <h4>Benchmark comparison</h4>
            <pre>
              {JSON.stringify(
                result.portfolio.benchmark_comparison,
                null,
                2
              )}
            </pre>
          </details>

          <p className="portfolio-ai-disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
