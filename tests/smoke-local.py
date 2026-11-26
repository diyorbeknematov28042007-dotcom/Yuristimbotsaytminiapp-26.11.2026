"""Run against `cf dev` for API and frontend after applying the local migration.

Example: python3 tests/smoke-local.py http://localhost:5173
Set BOT_INTERNAL_SECRET for the optional bot integration checks.
"""
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173").rstrip("/")
ORIGIN = BASE
cookies = {}
TEST_IP = "2001:db8::" + secrets.token_hex(4)
bot_secret = os.environ.get("BOT_INTERNAL_SECRET")
if not bot_secret and os.path.isfile("apps/api/.dev.vars.staging"):
    with open("apps/api/.dev.vars.staging", encoding="utf-8") as secret_file:
        for line in secret_file:
            if line.startswith("BOT_INTERNAL_SECRET="):
                bot_secret = line.strip().split("=", 1)[1]


def call(path, method="GET", data=None, csrf=None, bot_secret=None):
    headers = {"content-type": "application/json", "origin": ORIGIN, "cf-connecting-ip": TEST_IP}
    if cookies:
        headers["cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    if csrf:
        headers["x-csrf-token"] = csrf
    if bot_secret:
        headers["x-bot-secret"] = bot_secret
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(BASE + path, body, headers, method=method)
    try:
        response = urllib.request.urlopen(request)
    except urllib.error.HTTPError as error:
        response = error
    for value in response.headers.get_all("Set-Cookie", []):
        key, val = value.split(";", 1)[0].split("=", 1)
        cookies[key] = val
    raw = response.read().decode()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise AssertionError(f"{path} returned non-JSON HTTP {response.status}") from None
    return response.status, result


def expect(path, status, method="GET", data=None, csrf=None, bot_secret=None):
    got, result = call(path, method, data, csrf, bot_secret)
    assert got == status, (path, got, result)
    return result


expect("/health", 200)
username = "smoke_" + secrets.token_hex(5)
password = "local-smoke-password-123"
registered = expect("/api/v1/auth/register", 201, "POST", {"username": username, "password": password, "displayName": "Smoke Test", "language": "uz"})
assert registered["account"]["username"] == username
csrf = registered["csrf"]
expect("/api/v1/auth/register", 409, "POST", {"username": username, "password": password, "displayName": "Smoke Test", "language": "uz"})
expect("/api/v1/users/me/profile", 403, "PATCH", {"displayName": "Changed"})
expect("/api/v1/auth/login", 401, "POST", {"username": username, "password": "wrong-password"})
logged = expect("/api/v1/auth/login", 200, "POST", {"username": username, "password": password})
csrf = logged["csrf"]
changed = expect("/api/v1/users/me/profile", 200, "PATCH", {"displayName": "Updated Smoke"}, csrf)
assert changed["account"]["displayName"] == "Updated Smoke"
expect("/api/v1/users/me/settings", 200, "PATCH", {"language": "ru"}, csrf)
expect("/api/v1/users/me/tutorial", 200, "POST", None, csrf)
assert expect("/api/v1/users/me", 200)["account"]["tutorialDone"] is True
assert expect("/api/v1/conversations", 200)["conversations"] == []
expect("/api/v1/auth/special/start", 400, "POST", {"code": "invalid"})
expect("/api/v1/bot/start", 403, "POST", {"telegramUserId": 123})

if bot_secret:
    linked_tid = secrets.randbelow(2_000_000_000) + 100000
    linking = expect("/api/v1/users/me/telegram-link", 200, "POST", csrf=csrf)
    linked = expect("/api/v1/bot/link", 200, "POST", {"telegramUserId": linked_tid, "token": linking["token"]}, bot_secret=bot_secret)
    assert linked["ok"] and len(linked["code"]) == 6
    expect("/api/v1/bot/link", 404, "POST", {"telegramUserId": linked_tid, "token": linking["token"]}, bot_secret=bot_secret)
    expect("/api/v1/users/me/telegram-unlink", 403, "POST", {"password": "wrong-password"}, csrf)
    assert expect("/api/v1/users/me/telegram-unlink", 200, "POST", {"password": password}, csrf)["account"]["telegramLinked"] is False
    tid = secrets.randbelow(2_000_000_000) + 100000
    assert "username" in expect("/api/v1/bot/start", 200, "POST", {"telegramUserId": tid}, bot_secret=bot_secret)["message"]
    bot_name = "bot_" + secrets.token_hex(5)
    expect("/api/v1/bot/message", 200, "POST", {"telegramUserId": tid, "text": bot_name}, bot_secret=bot_secret)
    expect("/api/v1/bot/message", 200, "POST", {"telegramUserId": tid, "text": "Bot Tester"}, bot_secret=bot_secret)
    bot_result = expect("/api/v1/bot/message", 200, "POST", {"telegramUserId": tid, "text": "uz"}, bot_secret=bot_secret)
    token = bot_result["registrationToken"]
    details = expect("/api/v1/auth/bot-onboarding", 200, "POST", {"token": token})
    assert details["username"] == bot_name
    created = expect("/api/v1/auth/register", 201, "POST", {"username": bot_name, "password": password, "displayName": "Bot Tester", "language": "uz", "botToken": token})
    assert created["account"]["telegramLinked"] is True
    csrf = created["csrf"]
    expect("/api/v1/auth/bot-onboarding", 404, "POST", {"token": token})
    code_result = expect("/api/v1/bot/code", 200, "POST", {"telegramUserId": tid}, bot_secret=bot_secret)
    assert "identifikatsiya" in code_result["message"]
    code = re.search(r"\b\d{6}\b", code_result["message"]).group()
    explorer = os.environ.get("LOCAL_EXPLORER_URL", "http://localhost:8787").rstrip("/")
    with urllib.request.urlopen(explorer + "/cdn-cgi/local/explorer/api/d1/database") as response:
        databases = json.load(response)["result"]
    database_id = next(item["uuid"] for item in databases if item["name"] == "DB")
    raw_url = explorer + "/cdn-cgi/local/explorer/api/d1/database/" + database_id + "/raw"

    def local_sql(sql, params):
        request = urllib.request.Request(raw_url, json.dumps({"sql": sql, "params": params}).encode(), {"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(request) as response:
            result = json.load(response)
        assert result["success"], result

    challenge = expect("/api/v1/auth/special/start", 200, "POST", {"code": code})["challenge"]
    # Telegram delivery is unavailable in this local test. Restore the pending state
    # to test the approval transition without sending a real Telegram message.
    local_sql("UPDATE login_challenges SET status='pending' WHERE id=?", [challenge])
    expect("/api/v1/bot/challenge", 200, "POST", {"challenge": challenge, "telegramUserId": tid, "approve": True}, bot_secret=bot_secret)
    approved = expect(f"/api/v1/auth/special/status/{challenge}", 200)
    assert approved["status"] == "approved"
    csrf = approved["csrf"]
    assert expect(f"/api/v1/auth/special/status/{challenge}", 200)["status"] == "pending"
    denied_challenge = expect("/api/v1/auth/special/start", 200, "POST", {"code": code})["challenge"]
    local_sql("UPDATE login_challenges SET status='pending' WHERE id=?", [denied_challenge])
    expect("/api/v1/bot/challenge", 200, "POST", {"challenge": denied_challenge, "telegramUserId": tid, "approve": False}, bot_secret=bot_secret)
    assert expect(f"/api/v1/auth/special/status/{denied_challenge}", 200)["status"] == "pending"
    local_sql("UPDATE login_challenges SET expires_at=1 WHERE id=?", [denied_challenge])
    assert expect(f"/api/v1/auth/special/status/{denied_challenge}", 200)["status"] == "expired"
    print("Special approval, denial, expiry, and replay checks passed")
    print("Bot onboarding and code checks passed")

orphan_token = expect("/api/v1/users/me/telegram-link", 200, "POST", csrf=csrf)["token"] if bot_secret else None
expect("/api/v1/auth/logout", 200, "POST", None, csrf)
if bot_secret:
    expect("/api/v1/bot/link", 404, "POST", {"telegramUserId": 987654321, "token": orphan_token}, bot_secret=bot_secret)
expect("/api/v1/users/me", 401)
if bot_secret:
    relogged = expect("/api/v1/auth/login", 200, "POST", {"username": username, "password": password})
    local_sql("UPDATE sessions SET expires_at=1 WHERE user_id=? AND revoked_at IS NULL", [relogged["account"]["id"]])
    expect("/api/v1/users/me", 401)
print("Local API smoke checks passed")
