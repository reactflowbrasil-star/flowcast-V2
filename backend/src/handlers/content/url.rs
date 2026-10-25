use axum::http::HeaderMap;

use super::ContentResponse;

pub(crate) fn absolutize_metadata_url(url: Option<String>, base: &str) -> Option<String> {
    url.map(|original| {
        let trimmed = original.trim();
        if trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
            || trimmed.starts_with("data:")
            || trimmed.starts_with("blob:")
        {
            original
        } else if trimmed.starts_with("/metadata/") || trimmed.starts_with("metadata/") {
            let configured = crate::config::Config::from_env()
                .ok()
                .map(|c| c.public_base_url)
                .unwrap_or_else(|| base.to_string());
            let base_trimmed = configured.trim_end_matches('/');
            let p = if trimmed.starts_with('/') {
                trimmed.to_string()
            } else {
                format!("/{}", trimmed)
            };
            format!("{}{}", base_trimmed, p)
        } else {
            original
        }
    })
}

pub(crate) fn is_internal_url(url: &str, backend_base: &str) -> bool {
    let trimmed = url.trim();

    if trimmed.starts_with("/api/")
        || trimmed.starts_with("api/")
        || trimmed.starts_with("/metadata/")
        || trimmed.starts_with("metadata/")
    {
        return true;
    }
    if trimmed.starts_with('/') && !trimmed.starts_with("//") {
        return true;
    }
    if !backend_base.is_empty() {
        let base_trimmed = backend_base.trim_end_matches('/');
        if trimmed.starts_with(base_trimmed) {
            return true;
        }
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return false;
    }
    if trimmed.starts_with("rtmp://") || trimmed.starts_with("rtmps://") {
        return false;
    }
    false
}

pub(crate) fn absolutize_stream_url(url: String, base: &str) -> String {
    let trimmed = url.trim();

    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("rtmp://")
        || trimmed.starts_with("rtmps://")
    {
        return url;
    }

    if trimmed.starts_with("/api/") || trimmed.starts_with("api/") {
        let configured = crate::config::Config::from_env()
            .ok()
            .map(|c| c.public_base_url)
            .unwrap_or_else(|| base.to_string());
        let base_trimmed = configured.trim_end_matches('/');
        let path = if trimmed.starts_with('/') {
            trimmed.to_string()
        } else {
            format!("/{}", trimmed)
        };
        return format!("{}{}", base_trimmed, path);
    }

    url
}

pub(crate) fn absolutize_content_response(
    mut item: ContentResponse,
    base: &str,
) -> ContentResponse {
    let poster = item.poster_url.take();
    let image = item.image_url.take();
    let backdrop = item.backdrop_url.take();

    item.poster_url = absolutize_metadata_url(poster, base);
    item.image_url = absolutize_metadata_url(image, base);
    item.backdrop_url = absolutize_metadata_url(backdrop, base);

    item
}

fn parse_header_host(value: &str) -> (String, Option<u16>) {
    if value.starts_with('[') {
        if let Some(end) = value.find(']') {
            let host = &value[..=end];
            if let Some(port_str) = value[end + 1..].strip_prefix(':') {
                if let Ok(port) = port_str.parse::<u16>() {
                    return (host.to_string(), Some(port));
                }
            }
            return (host.to_string(), None);
        }
    }

    if let Some((host, port_str)) = value.rsplit_once(':') {
        if let Ok(port) = port_str.parse::<u16>() {
            return (host.to_string(), Some(port));
        }
    }

    (value.to_string(), None)
}

fn sanitize_bind_host(host: &str) -> String {
    match host {
        "0.0.0.0" | "::" | "[::]" => "localhost".to_string(),
        _ => host.to_string(),
    }
}

fn wrap_ipv6_for_url(host: &str) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{}]", host)
    } else {
        host.to_string()
    }
}

fn parse_config_host_port(config_addr: &str) -> Option<(String, u16)> {
    let trimmed = config_addr.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(addr) = trimmed.parse::<std::net::SocketAddr>() {
        let host = sanitize_bind_host(&addr.ip().to_string());
        return Some((host, addr.port()));
    }

    let without_scheme = if let Some(idx) = trimmed.find("://") {
        &trimmed[idx + 3..]
    } else {
        trimmed
    };

    if let Ok(addr) = without_scheme.parse::<std::net::SocketAddr>() {
        let host = sanitize_bind_host(&addr.ip().to_string());
        return Some((host, addr.port()));
    }

    if let Some((host_part, port_part)) = without_scheme.rsplit_once(':') {
        if let Ok(port) = port_part.trim_end_matches('/').parse::<u16>() {
            let host = sanitize_bind_host(host_part.trim_end_matches('/'));
            return Some((host, port));
        }
    }

    None
}

fn config_base_url(config: &crate::config::Config, scheme: &str) -> Option<String> {
    if let Some((host, port)) = parse_config_host_port(&config.server_address) {
        let host_for_url = wrap_ipv6_for_url(&host);
        return Some(format!("{}://{}:{}", scheme, host_for_url, port));
    }
    None
}

pub(crate) fn resolve_backend_base(headers: &HeaderMap, config: &crate::config::Config) -> String {
    if !config.public_base_url.trim().is_empty() {
        tracing::debug!("Using PUBLIC_BASE_URL: {}", config.public_base_url);
        return config.public_base_url.trim_end_matches('/').to_string();
    }

    tracing::warn!("PUBLIC_BASE_URL not configured, falling back to headers");

    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .unwrap_or("http");

    let forwarded_host = headers
        .get("x-forwarded-host")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty());

    let header_host = forwarded_host
        .or_else(|| headers.get("host").and_then(|value| value.to_str().ok()))
        .map(|value| value.to_string());

    let config_host_port = parse_config_host_port(&config.server_address);

    if let Some(host_value) = header_host.as_ref() {
        let (_, header_port) = parse_header_host(host_value);
        let use_header = match header_port {
            Some(port) => {
                let is_well_known = matches!(port, 80 | 443);
                let matches_config = config_host_port.map(|(_, cp)| cp == port).unwrap_or(false);
                is_well_known || matches_config
            }
            None => true,
        };

        if use_header {
            return format!("{}://{}", scheme, host_value);
        }
    }

    if let Some(base) = config_base_url(config, scheme) {
        return base;
    }

    if let Some(host_value) = header_host {
        return format!("{}://{}", scheme, host_value);
    }

    "http://localhost:3000".to_string()
}
