#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# STREAMCORE — API Smoke Test Script
# ═══════════════════════════════════════════════════════════════
# Run against a live instance to confirm all API endpoints respond correctly.
#
# Usage:
#   ./smoke_test.sh                          # defaults to http://localhost:3000
#   ./smoke_test.sh https://api.example.com  # custom base URL
#   BASE_URL=https://api.example.com ./smoke_test.sh
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ────────────────────────────────────
BASE_URL="${1:-${BASE_URL:-http://localhost:3000}}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

# ─── Colors ────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
TOTAL=0

# ─── Helpers ───────────────────────────────────

assert_status() {
    local description="$1"
    local expected="$2"
    local method="$3"
    local url="$4"
    shift 4
    local extra_args=("$@")

    TOTAL=$((TOTAL + 1))

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" "${extra_args[@]}" 2>/dev/null || echo "000")

    if [ "$http_code" = "$expected" ]; then
        echo -e "  ${GREEN}✓${NC} ${description} → ${http_code}"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} ${description} → ${RED}${http_code}${NC} (expected ${expected})"
        FAIL=$((FAIL + 1))
    fi
}

assert_json_field() {
    local description="$1"
    local method="$2"
    local url="$3"
    local field="$4"
    shift 4
    local extra_args=("$@")

    TOTAL=$((TOTAL + 1))

    local response
    response=$(curl -s -X "$method" "$url" "${extra_args[@]}" 2>/dev/null || echo "{}")

    if echo "$response" | grep -q "\"$field\""; then
        echo -e "  ${GREEN}✓${NC} ${description} → has '${field}'"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} ${description} → missing '${field}'"
        FAIL=$((FAIL + 1))
    fi
}

section() {
    echo ""
    echo -e "${CYAN}${BOLD}▸ $1${NC}"
}

# ─── Banner ────────────────────────────────────

echo -e "${BOLD}"
echo "  ╔════════════════════════════════════════╗"
echo "  ║     STREAMCORE — API Smoke Tests       ║"
echo "  ╚════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Target: ${CYAN}${BASE_URL}${NC}"
echo ""

# ─── 1. Server Reachability ────────────────────

section "Server Reachability"

TOTAL=$((TOTAL + 1))
if curl -s --connect-timeout 5 "$BASE_URL" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Server is reachable"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}✗${NC} Server is NOT reachable at ${BASE_URL}"
    FAIL=$((FAIL + 1))
    echo -e "\n${RED}Cannot continue — server unreachable${NC}"
    exit 1
fi

# ─── 2. Public Endpoints ──────────────────────

section "Public Endpoints (no auth required)"

assert_status "GET  /api/content/movies"      "200" GET  "${BASE_URL}/api/content/movies"
assert_status "GET  /api/content/series"      "200" GET  "${BASE_URL}/api/content/series"
assert_status "GET  /api/content/channels"    "200" GET  "${BASE_URL}/api/content/channels"
assert_status "GET  /api/content/categories"  "200" GET  "${BASE_URL}/api/content/categories"

# ─── 3. Auth Flow ─────────────────────────────

section "Authentication"

# Login
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}" 2>/dev/null || echo "{}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

TOTAL=$((TOTAL + 1))
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo -e "  ${GREEN}✓${NC} POST /api/auth/login → JWT obtained"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}✗${NC} POST /api/auth/login → failed (check ADMIN_USER/ADMIN_PASS)"
    FAIL=$((FAIL + 1))
    TOKEN=""
fi

# ─── 4. Authenticated Endpoints ───────────────

if [ -n "$TOKEN" ]; then
    AUTH=(-H "Authorization: Bearer ${TOKEN}")

    section "Authenticated Endpoints"

    assert_status "GET  /api/user/profile"     "200" GET  "${BASE_URL}/api/user/profile"     "${AUTH[@]}"
    assert_status "GET  /api/user/devices"     "200" GET  "${BASE_URL}/api/user/devices"     "${AUTH[@]}"

    # ─── 5. Admin Endpoints ────────────────────

    section "Admin Endpoints"

    assert_status "GET  /api/admin/users"               "200" GET  "${BASE_URL}/api/admin/users"            "${AUTH[@]}"
    assert_status "GET  /api/admin/config"               "200" GET  "${BASE_URL}/api/admin/config"           "${AUTH[@]}"
    assert_status "GET  /api/admin/payment-config"       "200" GET  "${BASE_URL}/api/admin/payment-config"   "${AUTH[@]}"

    assert_json_field "payment-config has stripe info" GET "${BASE_URL}/api/admin/payment-config" "has_stripe_key" "${AUTH[@]}"
    assert_json_field "payment-config has currency"    GET "${BASE_URL}/api/admin/payment-config" "stripe_currency" "${AUTH[@]}"

    # ─── 6. Content Detail Endpoints ───────────

    section "Content Detail Endpoints"

    # Get first movie ID
    MOVIE_ID=$(curl -s "${BASE_URL}/api/content/movies" "${AUTH[@]}" 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$MOVIE_ID" ]; then
        assert_status "GET  /api/content/${MOVIE_ID}/stream"  "200" GET "${BASE_URL}/api/content/${MOVIE_ID}/stream" "${AUTH[@]}"
    else
        TOTAL=$((TOTAL + 1))
        echo -e "  ${YELLOW}⊘${NC} No movies found — skipping stream endpoint test"
        SKIP=$((SKIP + 1))
    fi

    # ─── 7. Unauthorized Access ────────────────

    section "Authorization Guards"

    assert_status "GET  /api/admin/users (no auth)"           "401" GET  "${BASE_URL}/api/admin/users"
    assert_status "GET  /api/admin/payment-config (no auth)"  "401" GET  "${BASE_URL}/api/admin/payment-config"
    assert_status "GET  /api/user/profile (no auth)"          "401" GET  "${BASE_URL}/api/user/profile"

else
    echo -e "\n  ${YELLOW}⊘ Skipping authenticated tests — login failed${NC}"
    SKIP=$((SKIP + 5))
    TOTAL=$((TOTAL + 5))
fi

# ─── 8. Invalid Routes ────────────────────────

section "Invalid Routes (should 404)"

assert_status "GET  /api/nonexistent"            "404" GET  "${BASE_URL}/api/nonexistent"
assert_status "GET  /api/episodes/999999"        "404" GET  "${BASE_URL}/api/episodes/999999"  ${TOKEN:+-H "Authorization: Bearer ${TOKEN}"}

# ─── Summary ──────────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}  ${RED}Failed: ${FAIL}${NC}  ${YELLOW}Skipped: ${SKIP}${NC}  Total: ${TOTAL}"
echo -e "${BOLD}═══════════════════════════════════════${NC}"

if [ "$FAIL" -gt 0 ]; then
    echo -e "\n${RED}${BOLD}SMOKE TEST FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}${BOLD}ALL SMOKE TESTS PASSED ✓${NC}"
    exit 0
fi
