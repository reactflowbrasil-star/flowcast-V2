#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# StreamCore Load Test Suite
# ═══════════════════════════════════════════════════════════
#
# Uses `hey` (https://github.com/rakyll/hey) to benchmark
# key API endpoints under concurrent load.
#
# Usage:
#   ./load_test.sh                    # defaults: localhost:3000
#   ./load_test.sh http://myserver    # custom base URL
#
# Requirements:
#   - hey: go install github.com/rakyll/hey@latest
#   - A running StreamCore backend instance
#
# ═══════════════════════════════════════════════════════════

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
HEY=$(which hey 2>/dev/null || echo "$HOME/go/bin/hey")
RESULTS_DIR="$(dirname "$0")/load_test_results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT="$RESULTS_DIR/report_${TIMESTAMP}.txt"

# ── Colors ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Preflight checks ───────────────────────────
if ! command -v "$HEY" &>/dev/null; then
    echo -e "${RED}Error: 'hey' not found. Install with: go install github.com/rakyll/hey@latest${NC}"
    exit 1
fi

echo -e "${BOLD}${CYAN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║         StreamCore Load Test Suite v1.2.0             ║"
echo "║         Target: $BASE_URL"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Wait for backend to be ready
echo -e "${YELLOW}⏳ Waiting for backend to be ready...${NC}"
for i in $(seq 1 30); do
    if curl -s "$BASE_URL/api/health" | grep -q '"status"' 2>/dev/null; then
        echo -e "${GREEN}✅ Backend is ready!${NC}"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo -e "${RED}❌ Backend not reachable at $BASE_URL after 30s${NC}"
        exit 1
    fi
    sleep 1
done

mkdir -p "$RESULTS_DIR"

# ── Get admin token for authenticated tests ────
echo -e "\n${CYAN}🔑 Obtaining admin JWT token...${NC}"
ADMIN_PASS="${ADMIN_DEFAULT_PASSWORD:-ChangeMe_UseStrongPassword123!}"

LOGIN_RESPONSE=$(curl -sf "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null || true)

# Try fallback password if first attempt failed
if ! echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)['token']" 2>/dev/null; then
    ADMIN_PASS="admin123"
    LOGIN_RESPONSE=$(curl -sf "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null || true)
fi

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠️  Could not obtain admin token — authenticated tests will be skipped${NC}"
    HAS_TOKEN=false
else
    echo -e "${GREEN}✅ Admin token obtained${NC}"
    HAS_TOKEN=true
fi

# ── Test configuration ─────────────────────────
DURATION=10        # seconds per test
CONCURRENCY=50     # concurrent workers
RATE_LIMIT=200     # requests per second (0 = unlimited)

echo -e "\n${BOLD}📊 Test Configuration:${NC}"
echo "   Duration:    ${DURATION}s per endpoint"
echo "   Concurrency: ${CONCURRENCY} workers"
echo "   Rate limit:  ${RATE_LIMIT} req/s"
echo ""

# Start report
{
    echo "═══════════════════════════════════════════════════════"
    echo "  StreamCore Load Test Report"
    echo "  Date: $(date -Iseconds)"
    echo "  Target: $BASE_URL"
    echo "  Duration: ${DURATION}s | Concurrency: ${CONCURRENCY}"
    echo "═══════════════════════════════════════════════════════"
    echo ""
} > "$REPORT"

# ── Helper ─────────────────────────────────────
run_test() {
    local name="$1"
    local method="$2"
    local url="$3"
    local extra_args="${4:-}"

    echo -e "${CYAN}🔄 Testing: ${BOLD}${name}${NC}"
    echo -e "   ${method} ${url}"

    # Build hey command
    local cmd="$HEY -z ${DURATION}s -c ${CONCURRENCY} -q $(( RATE_LIMIT / CONCURRENCY )) -m ${method}"

    # Add extra args (headers, body, etc.)
    if [ -n "$extra_args" ]; then
        cmd="$cmd $extra_args"
    fi

    cmd="$cmd $url"

    # Run and capture output
    local output
    output=$(eval "$cmd" 2>&1)

    # Extract key metrics
    local rps=$(echo "$output" | grep "Requests/sec:" | awk '{print $2}')
    local avg_latency=$(echo "$output" | grep "Average:" | head -1 | awk '{print $2}')
    local p99_latency=$(echo "$output" | grep "99%" | head -1 | awk '{printf "%.4f", $2}')
    local total_reqs=$(echo "$output" | grep "^\[200\]" | awk '{print $2}')
    local status_200=$(echo "$output" | grep "^\[200\]" | awk '{print $2}')
    local status_other=$(echo "$output" | grep -E "^\[[^2]" | head -5)

    # Print summary
    echo -e "   ${GREEN}RPS: ${BOLD}${rps:-N/A}${NC}  |  Avg: ${avg_latency:-N/A}  |  P99: ${p99_latency:-N/A}  |  200s: ${status_200:-0}"
    if [ -n "$status_other" ]; then
        echo -e "   ${YELLOW}Non-200: ${status_other}${NC}"
    fi
    echo ""

    # Write to report
    {
        echo "─── $name ───"
        echo "$output"
        echo ""
    } >> "$REPORT"
}

# ═══════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════

echo -e "${BOLD}${YELLOW}═══ PUBLIC ENDPOINTS ═══${NC}\n"

run_test "Health Check" \
    "GET" \
    "$BASE_URL/api/health"

run_test "List Movies" \
    "GET" \
    "$BASE_URL/api/content/movies"

run_test "List Series" \
    "GET" \
    "$BASE_URL/api/content/series"

run_test "List Channels" \
    "GET" \
    "$BASE_URL/api/content/channels"

run_test "List Categories" \
    "GET" \
    "$BASE_URL/api/content/categories"

if [ "$HAS_TOKEN" = true ]; then
    echo -e "${BOLD}${YELLOW}═══ AUTHENTICATED ENDPOINTS ═══${NC}\n"

    AUTH_HEADER="-H \"Authorization: Bearer $TOKEN\""

    run_test "Admin Users List" \
        "GET" \
        "$BASE_URL/api/admin/users" \
        "$AUTH_HEADER"

    run_test "Admin Config" \
        "GET" \
        "$BASE_URL/api/admin/config" \
        "$AUTH_HEADER"

    run_test "User Profile" \
        "GET" \
        "$BASE_URL/api/user/profile" \
        "$AUTH_HEADER"

    run_test "Payment Config" \
        "GET" \
        "$BASE_URL/api/admin/payment-config" \
        "$AUTH_HEADER"
fi

echo -e "${BOLD}${YELLOW}═══ ERROR HANDLING ═══${NC}\n"

run_test "404 Not Found" \
    "GET" \
    "$BASE_URL/api/nonexistent/path"

run_test "Auth Without Token (401)" \
    "GET" \
    "$BASE_URL/api/admin/users"

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

echo -e "${BOLD}${GREEN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║              ✅ Load Test Complete!                    ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "📄 Full report: ${BOLD}$REPORT${NC}"
echo ""

# Print a machine-parseable summary at the end of the report
{
    echo ""
    echo "═══ QUICK SUMMARY ═══"
    echo "Date: $(date -Iseconds)"
    echo "Concurrency: $CONCURRENCY workers"
    echo "Duration: ${DURATION}s per endpoint"
    echo "Rate: ${RATE_LIMIT} req/s cap"
} >> "$REPORT"

echo -e "${CYAN}💡 Tip: To test with higher load, run:${NC}"
echo "   ./load_test.sh $BASE_URL   # then edit CONCURRENCY and RATE_LIMIT vars"
