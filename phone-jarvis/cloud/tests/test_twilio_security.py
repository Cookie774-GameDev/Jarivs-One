from twilio.request_validator import RequestValidator

from cloud.security import validate_twilio_signature


def test_twilio_signature_accepts_only_exact_signed_url_and_params():
    auth_token = "twilio-auth-token"
    url = "https://phone.example/twiml"
    params = {"CallSid": "CA123", "From": "+15550000001", "To": "+15550000002"}
    signature = RequestValidator(auth_token).compute_signature(url, params)

    assert validate_twilio_signature(auth_token, signature, url, params)
    assert not validate_twilio_signature(auth_token, signature, url + "?tampered=1", params)
    assert not validate_twilio_signature(auth_token, signature, url, {**params, "From": "+15559999999"})
