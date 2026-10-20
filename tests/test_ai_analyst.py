
import pandas as pd
from fastapi.testclient import TestClient

from src.marketlens.api import app
from src.marketlens.ai_analyst import AIAnalystError
import src.marketlens.api as api


client = TestClient(app)


def sample_market_data():
    return pd.DataFrame(
        {"Close": [100.0, 102.0, 101.0]},
        index=pd.to_datetime(
            ["2025-01-02", "2025-01-03", "2025-01-06"]
        ),
    )


def test_ai_analyst_returns_grounded_metrics(monkeypatch):
    metrics = {
        "total_return": 0.01,
        "annualized_volatility": 0.15,
        "maximum_drawdown": -0.02,
    }

    monkeypatch.setattr(
        api,
        "load_market_data_from_db",
        lambda ticker: sample_market_data(),
    )
    monkeypatch.setattr(
        api,
        "calculate_metrics",
        lambda data: (data, metrics),
    )

    def fake_answer(question, ticker, metrics):
        assert question == "Explain the risk"
        assert ticker == "AAPL"
        assert metrics["total_return"] == 0.01
        return "The supplied metrics show a 1% total return."

    monkeypatch.setattr(api, "answer_market_question", fake_answer)

    response = client.post(
        "/ai/ask",
        json={"question": "Explain the risk", "ticker": "aapl"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["metrics"] == metrics
    assert "1% total return" in body["answer"]
    assert body["disclaimer"]


def test_ai_analyst_rejects_invalid_date_range():
    response = client.post(
        "/ai/ask",
        json={
            "question": "Explain the risk",
            "ticker": "AAPL",
            "start_date": "2025-02-01",
            "end_date": "2025-01-01",
        },
    )

    assert response.status_code == 400


def test_ai_analyst_returns_404_without_market_data(monkeypatch):
    monkeypatch.setattr(
        api,
        "load_market_data_from_db",
        lambda ticker: pd.DataFrame(),
    )

    response = client.post(
        "/ai/ask",
        json={"question": "Explain the risk", "ticker": "AAPL"},
    )

    assert response.status_code == 404


def test_ai_analyst_handles_provider_failure(monkeypatch):
    monkeypatch.setattr(
        api,
        "load_market_data_from_db",
        lambda ticker: sample_market_data(),
    )
    monkeypatch.setattr(
        api,
        "calculate_metrics",
        lambda data: (data, {"total_return": 0.01}),
    )

    def fail_answer(question, ticker, metrics):
        raise AIAnalystError("AI provider request failed.")

    monkeypatch.setattr(api, "answer_market_question", fail_answer)

    response = client.post(
        "/ai/ask",
        json={"question": "Explain the risk", "ticker": "AAPL"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "AI provider request failed."
