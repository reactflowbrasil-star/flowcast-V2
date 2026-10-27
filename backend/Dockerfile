FROM rust:1-bookworm AS builder

WORKDIR /app

# Cache deps
COPY Cargo.toml Cargo.lock ./
COPY build.rs ./
COPY src ./src
COPY static ./static

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libpq5 \
    ffmpeg \
    curl \
    gnupg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/iptv-backend /app/iptv-backend
COPY --from=builder /app/static /app/static

EXPOSE 3000

CMD ["/app/iptv-backend"]
