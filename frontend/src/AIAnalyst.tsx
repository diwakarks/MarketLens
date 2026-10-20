
import { useState } from "react";
import "./AIAnalyst.css";

type AIAnalystResponse = {
  ticker: string;
  start_date: string;
  end_date: string;
  metrics: Record<string, number | string>;
  answer: string;
  disclaimer: string;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const SUGGESTED_QUESTIONS = [
  "Explain the historical risk metrics in simple terms.",
  "What does the maximum drawdown tell me?",
  "Explain the relationship between return and volatility.",
];

function formatMetricName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMetricValue(name: string, value: number | string): string {
  if (typeof value !== "number") return String(value);

  if (
    ["total_return", "annualized_volatility", "maximum_drawdown"].includes(name)
  ) {
    return `${(value * 100).toFixed(2)}%`;
  }

  if (["starting_close", "ending_close"].includes(name)) {
    return value.toFixed(2);
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

export default function AIAnalyst() {
  const [ticker, setTicker] = useState("AAPL");
  const [question, setQuestion] = useState(SUGGESTED_QUESTIONS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<AIAnalystResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAnalyst(submittedQuestion = question) {
    if (submittedQuestion.trim().length < 3) {
      setError("Enter a more specific question.");
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("The start date must be on or before the end date.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: submittedQuestion.trim(),
          ticker: ticker.trim().toUpperCase(),
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : `Request failed with status ${response.status}.`,
        );
      }

      setResult(body as AIAnalystResponse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reach the MarketLens API. Check that the backend is running.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ai-analyst">
      <header className="ai-analyst__header">
        <div>
          <p className="ai-analyst__eyebrow">MARKETLENS INTELLIGENCE</p>
          <h2>AI Market Analyst</h2>
          <p className="ai-analyst__subtitle">
            Ask questions about computed historical market metrics.
          </p>
        </div>
        <span className="ai-analyst__status">
          <span className="ai-analyst__status-dot" />
          Gemini powered
        </span>
      </header>

      <form
        className="ai-analyst__form"
        onSubmit={(event) => {
          event.preventDefault();
          void askAnalyst();
        }}
      >
        <div className="ai-analyst__fields">
          <label>
            Ticker
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              maxLength={15}
              required
              aria-label="Stock ticker"
              placeholder="AAPL"
            />
          </label>

          <label>
            Start date <span>(optional)</span>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label>
            End date <span>(optional)</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>

        <label className="ai-analyst__question-label" htmlFor="ai-question">
          What would you like to understand?
        </label>
        <textarea
          id="ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          minLength={3}
          maxLength={1000}
          required
          placeholder="Ask about returns, volatility, drawdown, or historical risk..."
        />

        <div className="ai-analyst__suggestions">
          {SUGGESTED_QUESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="ai-analyst__suggestion"
              onClick={() => setQuestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <button
          className="ai-analyst__submit"
          type="submit"
          disabled={loading || ticker.trim().length === 0}
        >
          {loading ? "Analyzing historical data..." : "Ask MarketLens"}
        </button>
      </form>

      {error && (
        <div className="ai-analyst__error" role="alert">
          <strong>Analysis could not be completed</strong>
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="ai-analyst__loading" role="status">
          <span className="ai-analyst__spinner" />
          Computing context and generating your explanation...
        </div>
      )}

      {result && (
        <article className="ai-analyst__result" aria-live="polite">
          <div className="ai-analyst__result-heading">
            <div>
              <p className="ai-analyst__eyebrow">ANALYSIS REPORT</p>
              <h3>{result.ticker} historical analysis</h3>
              <p className="ai-analyst__date-range">
                {result.start_date} — {result.end_date}
              </p>
            </div>
            <button
              type="button"
              className="ai-analyst__copy"
              onClick={() => {
                void navigator.clipboard.writeText(result.answer);
              }}
            >
              Copy answer
            </button>
          </div>

          <div className="ai-analyst__metrics">
            {Object.entries(result.metrics)
              .filter(([key]) =>
                [
                  "total_return",
                  "annualized_volatility",
                  "maximum_drawdown",
                  "observations",
                ].includes(key),
              )
              .map(([key, value]) => (
                <div className="ai-analyst__metric" key={key}>
                  <span>{formatMetricName(key)}</span>
                  <strong>{formatMetricValue(key, value)}</strong>
                </div>
              ))}
          </div>

          <div className="ai-analyst__answer">
            <h3>Analyst explanation</h3>
            <div className="ai-analyst__answer-text">{result.answer}</div>
          </div>

          <p className="ai-analyst__disclaimer">{result.disclaimer}</p>
        </article>
      )}
    </section>
  );
}
