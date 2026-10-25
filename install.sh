#!/usr/bin/env bash
# =============================================
# STREAMCORE - Docker Installation Script
# =============================================
# Interactive installer that:
#   1. Detects / installs Docker & Docker Compose
#   2. Prompts for all configuration values
#   3. Writes them directly into docker-compose.yml
#   4. Builds and launches the stack
# =============================================

set -euo pipefail

# ─── Colors ───────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Helpers ──────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

banner() {
    clear
    echo -e "${CYAN}${BOLD}"
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║                                                      ║"
    echo "║           ⚡  STREAMCORE INSTALLER  ⚡               ║"
    echo "║                                                      ║"
    echo "║    Docker-based deployment for StreamCore platform   ║"
    echo "║                                                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
}

separator() {
    echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"
}

# Prompt with default value
ask() {
    local prompt="$1"
    local default="$2"
    local varname="$3"
    local input

    if [[ -n "$default" ]]; then
        echo -ne "  ${BOLD}${prompt}${NC} [${GREEN}${default}${NC}]: "
    else
        echo -ne "  ${BOLD}${prompt}${NC}: "
    fi
    read -r input
    eval "$varname=\"${input:-$default}\""
}

# Prompt for password (hidden input)
ask_password() {
    local prompt="$1"
    local default="$2"
    local varname="$3"
    local input

    if [[ -n "$default" ]]; then
        echo -ne "  ${BOLD}${prompt}${NC} [${GREEN}${default}${NC}]: "
    else
        echo -ne "  ${BOLD}${prompt}${NC}: "
    fi
    read -rs input
    echo ""
    eval "$varname=\"${input:-$default}\""
}

# Prompt yes/no
ask_yn() {
    local prompt="$1"
    local default="$2"
    local varname="$3"
    local input

    echo -ne "  ${BOLD}${prompt}${NC} [${GREEN}${default}${NC}]: "
    read -r input
    input="${input:-$default}"
    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')
    if [[ "$input" == "y" || "$input" == "yes" || "$input" == "si" || "$input" == "s" ]]; then
        eval "$varname=true"
    else
        eval "$varname=false"
    fi
}

# ─── Step 1: Check root ──────────────────────
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        echo -e "  Run: ${YELLOW}sudo bash install.sh${NC}"
        exit 1
    fi
}

# ─── Step 2: Detect / Install Docker ─────────
install_docker() {
    separator
    echo -e "${MAGENTA}${BOLD}  📦  STEP 1: Docker Engine${NC}"
    separator
    echo ""

    if command -v docker &> /dev/null; then
        local docker_version
        docker_version=$(docker --version 2>/dev/null | head -1)
        success "Docker already installed: $docker_version"
    else
        warn "Docker not found. Installing..."
        echo ""

        # Detect OS
        if [[ -f /etc/os-release ]]; then
            . /etc/os-release
            local distro="${ID}"
        else
            error "Cannot detect OS. Please install Docker manually: https://docs.docker.com/engine/install/"
            exit 1
        fi

        info "Detected OS: ${distro}"

        case "$distro" in
            ubuntu|debian|linuxmint|pop)
                info "Installing Docker via official repository..."
                apt-get update -qq
                apt-get install -y -qq ca-certificates curl gnupg lsb-release

                # Add Docker's official GPG key
                install -m 0755 -d /etc/apt/keyrings
                curl -fsSL "https://download.docker.com/linux/${distro}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || \
                curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
                chmod a+r /etc/apt/keyrings/docker.gpg

                # Add Docker repo
                local codename
                codename=$(lsb_release -cs 2>/dev/null || echo "jammy")
                local repo_distro="$distro"
                # Some derivatives need to use ubuntu/debian repos
                if [[ "$distro" == "linuxmint" || "$distro" == "pop" ]]; then
                    repo_distro="ubuntu"
                fi
                echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${repo_distro} ${codename} stable" > /etc/apt/sources.list.d/docker.list

                apt-get update -qq
                apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
                ;;

            centos|rhel|rocky|almalinux|fedora)
                info "Installing Docker via official repository..."
                dnf -y install dnf-plugins-core 2>/dev/null || yum -y install yum-utils
                dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || \
                yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || \
                yum -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
                ;;

            *)
                warn "Unsupported distro: ${distro}. Trying generic install script..."
                curl -fsSL https://get.docker.com | sh
                ;;
        esac

        # Start and enable Docker
        systemctl start docker 2>/dev/null || true
        systemctl enable docker 2>/dev/null || true

        if command -v docker &> /dev/null; then
            success "Docker installed successfully: $(docker --version)"
        else
            error "Docker installation failed. Please install manually: https://docs.docker.com/engine/install/"
            exit 1
        fi
    fi

    echo ""

    # Check Docker Compose
    if docker compose version &> /dev/null; then
        success "Docker Compose: $(docker compose version 2>/dev/null | head -1)"
    elif command -v docker-compose &> /dev/null; then
        success "Docker Compose (standalone): $(docker-compose --version 2>/dev/null | head -1)"
        COMPOSE_CMD="docker-compose"
    else
        warn "Docker Compose plugin not found. Installing..."
        apt-get install -y -qq docker-compose-plugin 2>/dev/null || \
        dnf -y install docker-compose-plugin 2>/dev/null || \
        yum -y install docker-compose-plugin 2>/dev/null || {
            error "Could not install Docker Compose. Please install manually."
            exit 1
        }
        success "Docker Compose installed"
    fi

    # Default compose command
    COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

    # Ensure Docker daemon is running
    if ! docker info &> /dev/null; then
        warn "Docker daemon not running. Starting..."
        systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
        sleep 2
        if ! docker info &> /dev/null; then
            error "Cannot connect to Docker daemon. Is it running?"
            exit 1
        fi
    fi

    echo ""
}

# ─── Step 3: Configuration Prompts ───────────
collect_config() {
    separator
    echo -e "${MAGENTA}${BOLD}  ⚙️  STEP 2: Configuration${NC}"
    separator
    echo ""

    # ── App Identity ──
    echo -e "  ${CYAN}${BOLD}▸ Application Identity${NC}"
    echo ""
    ask "App name" "StreamCore" APP_NAME
    echo ""

    # ── Deployment Mode ──
    echo -e "  ${CYAN}${BOLD}▸ Deployment Mode${NC}"
    echo ""
    echo -e "  ${BOLD}How will you access StreamCore?${NC}"
    echo ""
    echo -e "    ${CYAN}1)${NC} ${BOLD}localhost${NC}         — Local/development (http://localhost)"
    echo -e "    ${CYAN}2)${NC} ${BOLD}IP address${NC}        — LAN access (e.g. http://192.168.1.100)"
    echo -e "    ${CYAN}3)${NC} ${BOLD}Domain name${NC}       — Production (e.g. https://myapp.com)"
    echo ""
    ask "Choose [1/2/3]" "1" DEPLOY_MODE
    echo ""

    case "$DEPLOY_MODE" in
        1|localhost)
            # ── LOCALHOST ──
            FRONTEND_DOMAIN="localhost"
            BACKEND_DOMAIN="localhost"
            FRONTEND_URL="http://localhost:5000"
            BACKEND_URL="http://localhost:3000"
            ENABLE_PROXY=false
            LETSENCRYPT_EMAIL="admin@localhost"

            echo -e "  ${GREEN}✓ Frontend: ${FRONTEND_URL}${NC}"
            echo -e "  ${GREEN}✓ Backend:  ${BACKEND_URL}${NC}"
            echo -e "  ${GREEN}✓ Nginx proxy: disabled${NC}"
            ;;

        2|ip)
            # ── IP ADDRESS ──
            ask "Server IP address" "192.168.1.100" SERVER_IP
            FRONTEND_DOMAIN="$SERVER_IP"
            BACKEND_DOMAIN="$SERVER_IP"
            FRONTEND_URL="http://${SERVER_IP}:5000"
            BACKEND_URL="http://${SERVER_IP}:3000"
            ENABLE_PROXY=false
            LETSENCRYPT_EMAIL="admin@streamcore.local"

            echo ""
            echo -e "  ${GREEN}✓ Frontend: ${FRONTEND_URL}${NC}"
            echo -e "  ${GREEN}✓ Backend:  ${BACKEND_URL}${NC}"
            echo -e "  ${GREEN}✓ Nginx proxy: disabled${NC}"
            ;;

        3|domain|*)
            # ── DOMAIN ──
            echo -e "  ${CYAN}${BOLD}▸ Domain Configuration${NC}"
            echo ""
            ask "Frontend domain (e.g. myapp.com)" "streamcore.com" FRONTEND_DOMAIN
            ask "Backend/API domain (e.g. api.myapp.com)" "api.${FRONTEND_DOMAIN}" BACKEND_DOMAIN
            echo ""

            # Ask proxy mode
            echo -e "  ${CYAN}${BOLD}▸ Reverse Proxy Mode${NC}"
            echo ""
            echo -e "    ${CYAN}1)${NC} ${BOLD}Automatic (Nginx + Let's Encrypt SSL)${NC}"
            echo -e "       Docker installs Nginx and manages SSL certificates automatically"
            echo ""
            echo -e "    ${CYAN}2)${NC} ${BOLD}Manual${NC}"
            echo -e "       You configure your own reverse proxy (Nginx, Caddy, Traefik...)"
            echo -e "       Ports 5000 (frontend) and 3000 (backend) will be exposed"
            echo ""
            ask "Choose [1/2]" "1" PROXY_MODE
            echo ""

            case "$PROXY_MODE" in
                1|auto|automatic)
                    # Nginx automatic
                    ENABLE_PROXY=true
                    FRONTEND_URL="https://${FRONTEND_DOMAIN}"
                    BACKEND_URL="https://${BACKEND_DOMAIN}"
                    ask "Email for Let's Encrypt SSL certificates" "admin@${FRONTEND_DOMAIN}" LETSENCRYPT_EMAIL
                    echo ""
                    echo -e "  ${GREEN}✓ Frontend: ${FRONTEND_URL}${NC}"
                    echo -e "  ${GREEN}✓ Backend:  ${BACKEND_URL}${NC}"
                    echo -e "  ${GREEN}✓ Nginx proxy: enabled (auto-SSL)${NC}"
                    ;;

                2|manual|*)
                    # Manual proxy
                    ENABLE_PROXY=false
                    FRONTEND_URL="https://${FRONTEND_DOMAIN}"
                    BACKEND_URL="https://${BACKEND_DOMAIN}"
                    LETSENCRYPT_EMAIL="admin@${FRONTEND_DOMAIN}"
                    echo -e "  ${GREEN}✓ Frontend: ${FRONTEND_URL}${NC}"
                    echo -e "  ${GREEN}✓ Backend:  ${BACKEND_URL}${NC}"
                    echo -e "  ${YELLOW}✓ Nginx proxy: disabled (configure your own)${NC}"
                    echo ""
                    echo -e "  ${YELLOW}After install, point your reverse proxy to:${NC}"
                    echo -e "    ${FRONTEND_DOMAIN}  →  localhost:5000"
                    echo -e "    ${BACKEND_DOMAIN}  →  localhost:3000"
                    ;;
            esac
            ;;
    esac

    echo ""

    # ── Database ──
    echo -e "  ${CYAN}${BOLD}▸ Database (PostgreSQL)${NC}"
    echo ""
    ask "PostgreSQL user" "streamcore" DB_USER
    ask_password "PostgreSQL password" "StreamCore_DB_2024_Production!" DB_PASSWORD
    ask "PostgreSQL database name" "streamcore" DB_NAME
    echo ""

    # ── Security ──
    echo -e "  ${CYAN}${BOLD}▸ Security${NC}"
    echo ""

    # Generate random JWT secret
    local default_jwt
    default_jwt=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)
    ask "JWT Secret" "$default_jwt" JWT_SECRET
    ask_password "Admin default password" "admin123" ADMIN_PASSWORD
    echo ""

    # ── Stripe (optional) ──
    echo -e "  ${CYAN}${BOLD}▸ Stripe Payments (optional — can also be configured in Admin UI after login)${NC}"
    echo -e "  ${YELLOW}Press Enter to skip — you can set these later in Admin UI > Settings > Payments${NC}"
    echo ""
    ask "Stripe Secret Key" "" STRIPE_SECRET_KEY
    ask "Stripe Webhook Secret" "" STRIPE_WEBHOOK_SECRET
    ask "Stripe Currency" "usd" STRIPE_CURRENCY
    echo ""

    # ── Proxy Security ──
    echo -e "  ${CYAN}${BOLD}▸ Media Proxy Security${NC}"
    echo ""
    ask "Allowed proxy hosts (comma-separated or * for all)" "*" PROXY_ALLOWED_HOSTS
    ask_yn "Require authentication for proxy? (y/n)" "n" PROXY_REQUIRE_AUTH
    ask_yn "Allow proxying to private/internal IPs? (y/n)" "y" PROXY_ALLOW_PRIVATE
    echo ""

    # ── Backup ──
    echo -e "  ${CYAN}${BOLD}▸ Backups${NC}"
    echo ""
    ask_yn "Enable automatic backups? (y/n)" "y" BACKUP_ENABLED
    ask "Backup retention (days)" "30" BACKUP_RETENTION_DAYS
    ask "Backup interval (hours)" "24" BACKUP_INTERVAL_HOURS
    echo ""

    # ── SMTP Encryption (optional) ──
    echo -e "  ${CYAN}${BOLD}▸ SMTP Password Encryption (optional)${NC}"
    echo ""
    echo -e "  ${YELLOW}If you plan to configure SMTP email, an encryption key protects${NC}"
    echo -e "  ${YELLOW}your SMTP password at rest using AES-256-GCM instead of Base64.${NC}"
    echo ""
    ask_yn "Generate SMTP encryption key? (y/n)" "y" GENERATE_SMTP_KEY
    if [[ "$GENERATE_SMTP_KEY" == "true" ]]; then
        SMTP_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)
        echo -e "  ${GREEN}✓ Generated SMTP key: ${SMTP_KEY}${NC}"
        echo -e "  ${YELLOW}  Save this key! You'll need it if you restore a backup.${NC}"
    else
        SMTP_KEY=""
    fi
    echo ""
}

# ─── Step 4: Apply Configuration ─────────────
apply_config() {
    separator
    echo -e "${MAGENTA}${BOLD}  🔧  STEP 3: Applying Configuration${NC}"
    separator
    echo ""

    local COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

    if [[ ! -f "$COMPOSE_FILE" ]]; then
        error "docker-compose.yml not found at: $COMPOSE_FILE"
        exit 1
    fi

    # Backup original
    cp "$COMPOSE_FILE" "${COMPOSE_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
    info "Backup created: docker-compose.yml.bak.*"

    # ── Helper: sed in-place (portable) ──
    do_sed() {
        sed -i "$@" "$COMPOSE_FILE"
    }

    # Build CORS origins
    local CORS_ORIGINS="${FRONTEND_URL},${BACKEND_URL}"
    if [[ "$FRONTEND_DOMAIN" != "localhost" ]]; then
        CORS_ORIGINS="${CORS_ORIGINS},http://localhost:5000,http://localhost:3000"
    fi

    # Build DATABASE_URL for container (always connects to internal postgres:5432)
    local DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}"

    # Build Stripe URLs
    local STRIPE_SUCCESS_URL="${FRONTEND_URL}/credits/success"
    local STRIPE_CANCEL_URL="${FRONTEND_URL}/credits/cancel"

    info "Applying database configuration..."
    # PostgreSQL
    do_sed "s|POSTGRES_USER: .*|POSTGRES_USER: ${DB_USER}|g"
    do_sed "s|POSTGRES_PASSWORD: .*|POSTGRES_PASSWORD: ${DB_PASSWORD}|g"
    do_sed "s|POSTGRES_DB: .*|POSTGRES_DB: ${DB_NAME}|g"
    # Healthcheck uses the user and db name
    do_sed "s|pg_isready -U [^ ]* -d [^ ]*\"|pg_isready -U ${DB_USER} -d ${DB_NAME}\"|g"
    success "Database configured"

    info "Applying backend configuration..."
    # Backend DATABASE_URL
    do_sed "s|DATABASE_URL: \"postgres://.*\"|DATABASE_URL: \"${DATABASE_URL}\"|g"
    # Backend URLs
    do_sed "s|PUBLIC_BASE_URL: \"http[s]*://.*\"|PUBLIC_BASE_URL: \"${BACKEND_URL}\"|g"
    do_sed "s|CORS_ALLOWED_ORIGINS: \".*\"|CORS_ALLOWED_ORIGINS: \"${CORS_ORIGINS}\"|g"
    # Security
    do_sed "s|JWT_SECRET: \".*\"|JWT_SECRET: \"${JWT_SECRET}\"|g"
    do_sed "s|ADMIN_DEFAULT_PASSWORD: \".*\"|ADMIN_DEFAULT_PASSWORD: \"${ADMIN_PASSWORD}\"|g"
    # Stripe
    do_sed "s|STRIPE_SECRET_KEY: \".*\"|STRIPE_SECRET_KEY: \"${STRIPE_SECRET_KEY}\"|g"
    do_sed "s|STRIPE_WEBHOOK_SECRET: \".*\"|STRIPE_WEBHOOK_SECRET: \"${STRIPE_WEBHOOK_SECRET}\"|g"
    do_sed "s|STRIPE_CURRENCY: \".*\"|STRIPE_CURRENCY: \"${STRIPE_CURRENCY}\"|g"
    do_sed "s|STRIPE_SUCCESS_URL: \".*\"|STRIPE_SUCCESS_URL: \"${STRIPE_SUCCESS_URL}\"|g"
    do_sed "s|STRIPE_CANCEL_URL: \".*\"|STRIPE_CANCEL_URL: \"${STRIPE_CANCEL_URL}\"|g"
    # Backup
    if [[ "$BACKUP_ENABLED" == "true" ]]; then
        do_sed "s|BACKUP_ENABLED: \".*\"|BACKUP_ENABLED: \"true\"|g"
    else
        do_sed "s|BACKUP_ENABLED: \".*\"|BACKUP_ENABLED: \"false\"|g"
    fi
    do_sed "s|BACKUP_RETENTION_DAYS: \".*\"|BACKUP_RETENTION_DAYS: \"${BACKUP_RETENTION_DAYS}\"|g"
    do_sed "s|BACKUP_INTERVAL_HOURS: \".*\"|BACKUP_INTERVAL_HOURS: \"${BACKUP_INTERVAL_HOURS}\"|g"
    success "Backend configured"

    info "Applying backend proxy labels..."
    # Backend VIRTUAL_HOST / LETSENCRYPT_HOST / LETSENCRYPT_EMAIL
    # These appear in the backend section — use line-range awareness
    # Since VIRTUAL_HOST appears in both backend and frontend, we need to replace all
    # and let them be contextual. The file has them in order: backend first, then frontend.
    # We'll use a python one-liner for precise replacement.
    python3 - "$COMPOSE_FILE" "$BACKEND_DOMAIN" "$FRONTEND_DOMAIN" "$LETSENCRYPT_EMAIL" <<'PYEOF'
import sys, re

filepath = sys.argv[1]
backend_domain = sys.argv[2]
frontend_domain = sys.argv[3]
email = sys.argv[4]

with open(filepath, 'r') as f:
    content = f.read()

# Track which section we're in to replace VIRTUAL_HOST/LETSENCRYPT_HOST contextually
lines = content.split('\n')
section = None
result = []
for line in lines:
    stripped = line.strip()
    # Detect top-level service sections
    if stripped.startswith('backend:') and not stripped.startswith('backend-data'):
        section = 'backend'
    elif stripped.startswith('frontend:'):
        section = 'frontend'
    elif stripped.startswith('nginx-proxy:'):
        section = 'nginx-proxy'
    elif stripped.startswith('acme-companion:'):
        section = 'acme-companion'
    elif stripped.startswith('networks:') or stripped.startswith('volumes:'):
        section = None

    # Replace VIRTUAL_HOST
    if 'VIRTUAL_HOST:' in stripped and section in ('backend', 'frontend'):
        domain = backend_domain if section == 'backend' else frontend_domain
        line = re.sub(r'VIRTUAL_HOST: ".*"', f'VIRTUAL_HOST: "{domain}"', line)

    # Replace LETSENCRYPT_HOST
    if 'LETSENCRYPT_HOST:' in stripped and section in ('backend', 'frontend'):
        domain = backend_domain if section == 'backend' else frontend_domain
        line = re.sub(r'LETSENCRYPT_HOST: ".*"', f'LETSENCRYPT_HOST: "{domain}"', line)

    # Replace LETSENCRYPT_EMAIL
    if 'LETSENCRYPT_EMAIL:' in stripped and section in ('backend', 'frontend'):
        line = re.sub(r'LETSENCRYPT_EMAIL: ".*"', f'LETSENCRYPT_EMAIL: "{email}"', line)

    # Replace DEFAULT_EMAIL in acme-companion
    if 'DEFAULT_EMAIL:' in stripped and section == 'acme-companion':
        line = re.sub(r'DEFAULT_EMAIL: ".*"', f'DEFAULT_EMAIL: "{email}"', line)

    result.append(line)

with open(filepath, 'w') as f:
    f.write('\n'.join(result))
PYEOF
    # Also replace DEFAULT_EMAIL (only appears once in acme-companion, safe for sed)
    do_sed "s|DEFAULT_EMAIL: \".*\"|DEFAULT_EMAIL: \"${LETSENCRYPT_EMAIL}\"|g"
    success "Proxy labels configured"

    info "Applying frontend configuration..."
    # Frontend APP_NAME (build arg)
    do_sed "s|APP_NAME: \".*\"|APP_NAME: \"${APP_NAME}\"|g"
    # Frontend NEXT_PUBLIC_API_URL (both build arg and runtime env)
    do_sed "s|NEXT_PUBLIC_API_URL: \".*\"|NEXT_PUBLIC_API_URL: \"${BACKEND_URL}\"|g"
    # Frontend NEXT_PUBLIC_APP_NAME
    do_sed "s|NEXT_PUBLIC_APP_NAME: \".*\"|NEXT_PUBLIC_APP_NAME: \"${APP_NAME}\"|g"
    # Proxy settings
    do_sed "s|STREAMCORE_PROXY_ALLOWED_HOSTS: \".*\"|STREAMCORE_PROXY_ALLOWED_HOSTS: \"${PROXY_ALLOWED_HOSTS}\"|g"
    do_sed "s|STREAMCORE_PROXY_REQUIRE_AUTH: \".*\"|STREAMCORE_PROXY_REQUIRE_AUTH: \"${PROXY_REQUIRE_AUTH}\"|g"
    do_sed "s|STREAMCORE_PROXY_ALLOW_PRIVATE: \".*\"|STREAMCORE_PROXY_ALLOW_PRIVATE: \"${PROXY_ALLOW_PRIVATE}\"|g"
    success "Frontend configured"

    # SMTP encryption key (uncomment and set if provided)
    if [[ -n "$SMTP_KEY" ]]; then
        info "Applying SMTP encryption key..."
        # Uncomment the STREAMCORE_SMTP_KEY line and set the value
        do_sed "s|# STREAMCORE_SMTP_KEY: \".*\"|STREAMCORE_SMTP_KEY: \"${SMTP_KEY}\"|g"
        success "SMTP key configured"
    fi

    echo ""
}

# ─── Step 5: Build & Launch ──────────────────
build_and_launch() {
    separator
    echo -e "${MAGENTA}${BOLD}  🚀  STEP 4: Building & Launching${NC}"
    separator
    echo ""

    cd "$SCRIPT_DIR"

    info "Building Docker images... (this may take several minutes on first run)"
    echo ""

    if [[ "$ENABLE_PROXY" == "true" ]]; then
        info "Starting with Nginx proxy + SSL..."
        echo ""
        $COMPOSE_CMD --profile proxy up -d --build
    else
        info "Starting without proxy (direct access via ports)..."
        echo ""
        $COMPOSE_CMD up -d --build
    fi

    echo ""

    # Wait for services to be healthy
    info "Waiting for services to start..."
    local max_wait=60
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        if docker inspect --format='{{.State.Health.Status}}' streamcore-postgres 2>/dev/null | grep -q "healthy"; then
            break
        fi
        sleep 2
        waited=$((waited + 2))
        echo -ne "\r  Waiting for PostgreSQL... ${waited}s"
    done
    echo ""

    if docker inspect --format='{{.State.Health.Status}}' streamcore-postgres 2>/dev/null | grep -q "healthy"; then
        success "PostgreSQL is healthy"
    else
        warn "PostgreSQL may still be starting..."
    fi

    # Check if backend is running
    sleep 3
    if docker ps --format '{{.Names}}' | grep -q "streamcore-backend"; then
        success "Backend is running"
    else
        warn "Backend container may still be starting..."
    fi

    if docker ps --format '{{.Names}}' | grep -q "streamcore-frontend"; then
        success "Frontend is running"
    else
        warn "Frontend container may still be starting..."
    fi

    if [[ "$ENABLE_PROXY" == "true" ]]; then
        if docker ps --format '{{.Names}}' | grep -q "nginx-proxy"; then
            success "Nginx proxy is running"
        else
            warn "Nginx proxy may still be starting..."
        fi
    fi

    echo ""
}

# ─── Step 6: Summary ─────────────────────────
show_summary() {
    separator
    echo -e "${GREEN}${BOLD}  ✅  INSTALLATION COMPLETE${NC}"
    separator
    echo ""
    echo -e "  ${BOLD}Application:${NC}  ${APP_NAME}"
    echo ""
    echo -e "  ${BOLD}Frontend:${NC}     ${GREEN}${FRONTEND_URL}${NC}"
    echo -e "  ${BOLD}Backend API:${NC}  ${GREEN}${BACKEND_URL}${NC}"
    echo -e "  ${BOLD}Database:${NC}     localhost:5433 (user: ${DB_USER}, db: ${DB_NAME})"
    echo ""

    if [[ "$ENABLE_PROXY" == "true" ]]; then
        echo -e "  ${BOLD}SSL:${NC}          ${GREEN}Enabled (auto via Let's Encrypt)${NC}"
    else
        echo -e "  ${BOLD}SSL:${NC}          ${YELLOW}Disabled (direct access)${NC}"
    fi

    echo ""
    echo -e "  ${BOLD}Admin Login:${NC}"
    echo -e "    User:     ${CYAN}admin${NC}"
    echo -e "    Password: ${CYAN}${ADMIN_PASSWORD}${NC}"
    echo ""
    separator
    echo ""
    echo -e "  ${BOLD}Useful commands:${NC}"
    echo ""
    echo -e "    ${YELLOW}View logs:${NC}"
    echo -e "      docker compose logs -f"
    echo ""
    echo -e "    ${YELLOW}View specific service logs:${NC}"
    echo -e "      docker compose logs -f backend"
    echo -e "      docker compose logs -f frontend"
    echo -e "      docker compose logs -f postgres"
    echo ""
    echo -e "    ${YELLOW}Stop all services:${NC}"
    if [[ "$ENABLE_PROXY" == "true" ]]; then
        echo -e "      docker compose --profile proxy down"
    else
        echo -e "      docker compose down"
    fi
    echo ""
    echo -e "    ${YELLOW}Restart all services:${NC}"
    if [[ "$ENABLE_PROXY" == "true" ]]; then
        echo -e "      docker compose --profile proxy up -d"
    else
        echo -e "      docker compose up -d"
    fi
    echo ""
    echo -e "    ${YELLOW}Rebuild after code changes:${NC}"
    if [[ "$ENABLE_PROXY" == "true" ]]; then
        echo -e "      docker compose --profile proxy up -d --build"
    else
        echo -e "      docker compose up -d --build"
    fi
    echo ""
    echo -e "    ${YELLOW}Reset database (⚠️  destroys all data):${NC}"
    echo -e "      docker compose down -v"
    echo ""
    separator
    echo ""
    echo -e "  ${GREEN}${BOLD}StreamCore is ready! 🎉${NC}"
    echo ""
}

# ─── UPDATE MODE ──────────────────────────────
do_update() {
    separator
    echo -e "${MAGENTA}${BOLD}  🔄  UPDATE: Rebuilding Services${NC}"
    separator
    echo ""

    cd "$SCRIPT_DIR"

    info "This will rebuild the backend and frontend containers."
    info "Database and configuration will NOT be touched."
    echo ""

    ask_yn "Proceed with update? (y/n)" "y" CONFIRM
    if [[ "$CONFIRM" != "true" ]]; then
        warn "Update cancelled."
        exit 0
    fi

    echo ""

    # Detect if proxy profile is active (nginx-proxy container exists)
    local use_proxy=false
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "nginx-proxy"; then
        use_proxy=true
    fi

    info "Stopping backend and frontend..."
    $COMPOSE_CMD stop backend frontend
    echo ""

    info "Rebuilding backend and frontend... (this may take several minutes)"
    echo ""
    $COMPOSE_CMD build --no-cache backend frontend
    echo ""

    info "Starting services..."
    if [[ "$use_proxy" == "true" ]]; then
        $COMPOSE_CMD --profile proxy up -d
    else
        $COMPOSE_CMD up -d
    fi

    echo ""

    # Wait a bit and check services
    sleep 5
    if docker ps --format '{{.Names}}' | grep -q "streamcore-backend"; then
        success "Backend is running"
    else
        warn "Backend container may still be starting..."
    fi

    if docker ps --format '{{.Names}}' | grep -q "streamcore-frontend"; then
        success "Frontend is running"
    else
        warn "Frontend container may still be starting..."
    fi

    echo ""
    separator
    echo -e "${GREEN}${BOLD}  ✅  UPDATE COMPLETE${NC}"
    separator
    echo ""
    echo -e "  Backend and frontend have been rebuilt with the latest code."
    echo -e "  Database and configuration were preserved."
    echo ""
    echo -e "  ${YELLOW}View logs:${NC}  docker compose logs -f backend frontend"
    echo ""
}

# ─── Main ─────────────────────────────────────
main() {
    # Resolve script directory (where docker-compose.yml lives)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    banner
    check_root

    # ── Main Menu ──
    separator
    echo -e "${MAGENTA}${BOLD}  📋  What would you like to do?${NC}"
    separator
    echo ""
    echo -e "    ${CYAN}1)${NC} ${BOLD}New Installation${NC}"
    echo -e "       Full setup: configure Docker, database, domains, and build everything"
    echo ""
    echo -e "    ${CYAN}2)${NC} ${BOLD}Update${NC}"
    echo -e "       Rebuild backend & frontend only (keeps database and config intact)"
    echo ""
    ask "Choose [1/2]" "1" INSTALL_MODE
    echo ""

    case "$INSTALL_MODE" in
        2|update)
            # ── UPDATE MODE ──
            install_docker
            do_update
            ;;

        1|new|*)
            # ── NEW INSTALLATION ──
            install_docker
            collect_config

            # Confirmation
            separator
            echo ""
            echo -e "  ${BOLD}Configuration Summary:${NC}"
            echo ""
            echo -e "    App Name:        ${CYAN}${APP_NAME}${NC}"
            echo -e "    Frontend:        ${CYAN}${FRONTEND_URL}${NC}"
            echo -e "    Backend:         ${CYAN}${BACKEND_URL}${NC}"
            echo -e "    DB User:         ${CYAN}${DB_USER}${NC}"
            echo -e "    DB Name:         ${CYAN}${DB_NAME}${NC}"
            echo -e "    Admin Password:  ${CYAN}${ADMIN_PASSWORD}${NC}"
            echo -e "    Nginx Proxy:     ${CYAN}${ENABLE_PROXY}${NC}"
            echo ""

            ask_yn "Proceed with installation? (y/n)" "y" CONFIRM
            if [[ "$CONFIRM" != "true" ]]; then
                warn "Installation cancelled."
                exit 0
            fi

            echo ""
            apply_config
            build_and_launch
            show_summary
            ;;
    esac
}

main "$@"

