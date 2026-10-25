pub const CONTENT_JOIN_SELECT: &str = r#"
SELECT 
    mc.id, mc.category_id, mc.title, mc.description, mc.image_url, mc.backdrop_url, mc.media_type, mc.active, mc.created_at,
    cat.category_type,
    m.tmdb_id, m.year, m.duration, m.rating, m.genre,
    t.channel_number, t.is_live, t.provider, t.country, t.epg_source_id, t.epg_channel_id, t.epg_offset_minutes, t.channel_category,
    s.id as stream_id, s.stream_url, s.stream_type, s.quality, s.language, s.format, s.drm_keys, s.drm_type, s.license_server_url, 
    s.drm_headers, s.origin, s.user_agent, s.referer, s.custom_headers, s.proxy_url, s.doh_url
FROM content.media_content mc
LEFT JOIN content.categories cat ON mc.category_id = cat.id
LEFT JOIN content.movies m ON mc.id = m.media_content_id
LEFT JOIN content.tv_channels t ON mc.id = t.media_content_id
LEFT JOIN content.media_streams s ON mc.id = s.media_content_id AND s.is_default = true
"#;
