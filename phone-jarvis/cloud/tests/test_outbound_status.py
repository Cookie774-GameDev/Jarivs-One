from cloud.billing import terminal_call_settlement


def test_terminal_call_failures_release_full_reservation():
    for status in ("busy", "failed", "no-answer", "canceled"):
        assert terminal_call_settlement(status, None) == ("released", 0)


def test_completed_call_settles_provider_duration_and_ignores_non_terminal_statuses():
    assert terminal_call_settlement("completed", "42") == ("settled", 42)
    assert terminal_call_settlement("completed", "not-a-number") == ("settled", 0)
    assert terminal_call_settlement("ringing", None) is None
