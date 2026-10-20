import pytest
from pydantic import ValidationError

from src.marketlens.api import PortfolioAIAnalystRequest


def test_portfolio_ai_request_accepts_valid_weights():
    request = PortfolioAIAnalystRequest(
        question="Explain portfolio risk",
        tickers=["aapl", "msft"],
        weights=[0.6, 0.4],
    )

    assert request.tickers == ["AAPL", "MSFT"]


def test_portfolio_ai_request_rejects_weights_not_summing_to_one():
    with pytest.raises(ValidationError):
        PortfolioAIAnalystRequest(
            question="Explain portfolio risk",
            tickers=["AAPL", "MSFT"],
            weights=[0.6, 0.6],
        )


def test_portfolio_ai_request_rejects_duplicate_tickers():
    with pytest.raises(ValidationError):
        PortfolioAIAnalystRequest(
            question="Explain portfolio risk",
            tickers=["AAPL", "AAPL"],
            weights=[0.5, 0.5],
        )


def test_portfolio_ai_request_rejects_reversed_dates():
    with pytest.raises(ValidationError):
        PortfolioAIAnalystRequest(
            question="Explain portfolio risk",
            tickers=["AAPL"],
            weights=[1.0],
            start_date="2025-12-31",
            end_date="2025-01-01",
        )