from cloud.billing import (
    BillingService,
    bounded_elapsed_seconds,
    remaining_call_timeout,
)


class Response:
    def __init__(self, data):
        self.data = data


class RpcBuilder:
    def __init__(self, response):
        self.response = response

    def execute(self):
        return Response(self.response)


class FakeClient:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        response = self.responses[name]
        if isinstance(response, list):
            response = response.pop(0)
        return RpcBuilder(response)


def test_billing_reserves_and_settles_with_server_rpc():
    client = FakeClient({
        "reserve_usage_budget": {"ok": True, "reservation_id": "res-1"},
        "settle_usage_budget": {"ok": True, "status": "settled"},
    })
    service = BillingService(client=client)
    reservation = service.reserve_call(
        "11111111-1111-4111-8111-111111111111",
        estimate_usd=0.1,
        idempotency_key="phone-call-request-123",
        estimated_seconds=60,
    )
    assert reservation.ok and reservation.reservation_id == "res-1"
    assert service.settle_call(
        "11111111-1111-4111-8111-111111111111",
        "res-1",
        actual_usd=0.05,
        actual_seconds=30,
    )
    assert [call[0] for call in client.calls] == [
        "reserve_usage_budget", "settle_usage_budget",
    ]


def test_billing_claims_reserved_call_once_with_exact_provider_reference():
    client = FakeClient({"claim_usage_reservation": True})
    service = BillingService(client=client)

    assert service.claim_call(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "CA123",
    )
    assert client.calls == [(
        "claim_usage_reservation",
        {
            "p_user_id": "11111111-1111-4111-8111-111111111111",
            "p_reservation_id": "22222222-2222-4222-8222-222222222222",
            "p_kind": "call",
            "p_provider_reference": "CA123",
        },
    )]


def test_billing_claim_fails_closed_on_invalid_response():
    service = BillingService(client=FakeClient({"claim_usage_reservation": {"ok": True}}))
    assert not service.claim_call(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "CA123",
    )


def test_billing_fails_closed_on_invalid_rpc_response():
    service = BillingService(client=FakeClient({"reserve_usage_budget": None}))
    reservation = service.reserve_call(
        "11111111-1111-4111-8111-111111111111",
        estimate_usd=0.1,
        idempotency_key="phone-call-request-123",
        estimated_seconds=60,
    )
    assert not reservation.ok
    assert reservation.reason == "usage_unavailable"


def test_billing_caps_call_to_server_reserved_seconds():
    client = FakeClient({
        "voice_rate_limit_hit": {"limited": False, "count": 1},
        "reserve_usage_budget": [
            {"ok": False, "reason": "window_5h_exceeded", "remaining_usd": 0.25},
            {
                "ok": True,
                "reservation_id": "res-2",
                "reserved_usd": 0.25,
                "reserved_count": 150,
            },
        ],
    })
    service = BillingService(client=client)

    reservation = service.reserve_bounded_call(
        "11111111-1111-4111-8111-111111111111",
        idempotency_key="phone-call-request-456",
        max_seconds=1_800,
        min_seconds=60,
    )

    assert reservation.ok
    assert reservation.reservation_id == "res-2"
    assert reservation.reserved_seconds == 150
    assert len(client.calls) == 3
    assert client.calls[0][0] == "voice_rate_limit_hit"
    assert client.calls[1][1]["p_count"] == 1_800
    assert client.calls[2][1]["p_count"] == 150
    assert client.calls[2][1]["p_estimate_usd"] == 0.25


def test_billing_rate_limits_before_reserving_provider_budget():
    client = FakeClient({
        "voice_rate_limit_hit": {"limited": True, "count": 4},
        "reserve_usage_budget": {"ok": True, "reservation_id": "must-not-run"},
    })
    service = BillingService(client=client)

    reservation = service.reserve_bounded_call(
        "11111111-1111-4111-8111-111111111111",
        idempotency_key="phone-call-rate-limited",
    )

    assert not reservation.ok
    assert reservation.reason == "rate_limited"
    assert [call[0] for call in client.calls] == ["voice_rate_limit_hit"]


def test_call_timeout_and_settlement_never_exceed_reserved_duration():
    assert remaining_call_timeout(100.0, 60, now=115.25) == 44.75
    assert remaining_call_timeout(100.0, 60, now=161.0) == 0.0
    assert bounded_elapsed_seconds(100.0, 60, now=159.2) == 60
    assert bounded_elapsed_seconds(100.0, 60, now=165.0) == 60
