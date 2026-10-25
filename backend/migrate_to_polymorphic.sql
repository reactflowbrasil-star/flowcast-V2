-- Migration script to split data from the legacy 'content' table into 
-- the new polymorphic tables (media_content, movies, tv_channels, media_streams)
-- FOR POSTGRESQL

BEGIN;

-- 1. Insert into media_content
INSERT INTO media_content (
    id, category_id, title, description, image_url, 
    media_type, active, created_at
)
SELECT 
    c.id, c.category_id, c.title, c.description, c.image_url,
    -- Determine media type based on the category's type
    CASE 
        WHEN cat.category_type = 'VOD' THEN 'movie'
        WHEN cat.category_type = 'Series' THEN 'series'
        WHEN cat.category_type = 'TV' THEN 'tv_channel'
        WHEN cat.category_type = 'Eventos' THEN 'event'
        WHEN cat.category_type = 'Anime' THEN 'anime'
        WHEN cat.category_type = 'Kids' THEN 'kids'
        ELSE 'movie'
    END,
    c.active, c.created_at
FROM content c
JOIN categories cat ON c.category_id = cat.id
ON CONFLICT (id) DO NOTHING;

-- Fix identity sequence since we did explicit ID inserts
SELECT setval('media_content_id_seq', (SELECT MAX(id) FROM media_content));

-- 2. Insert into tv_channels for TV/Event categories
INSERT INTO tv_channels (
    media_content_id, channel_number, is_live, provider, country,
    epg_source_id, epg_channel_id, epg_offset_minutes
)
SELECT 
    c.id, c.channel_number, c.is_live, c.provider, c.country,
    c.epg_source_id, c.epg_channel_id, c.epg_offset_minutes
FROM content c
JOIN categories cat ON c.category_id = cat.id
WHERE cat.category_type IN ('TV', 'Eventos')
ON CONFLICT (media_content_id) DO NOTHING;

-- 3. Insert into movies for VOD/Series/Anime/Kids categories
INSERT INTO movies (
    media_content_id, backdrop_url, year, duration, rating,
    genre, tmdb_id, subtitle_languages
)
SELECT 
    c.id, c.backdrop_url, c.year, c.duration, c.rating,
    c.genre, c.tmdb_id, c.subtitle_languages
FROM content c
JOIN categories cat ON c.category_id = cat.id
WHERE cat.category_type NOT IN ('TV', 'Eventos')
ON CONFLICT (media_content_id) DO NOTHING;

-- 4. Insert into media_streams (Main default stream)
INSERT INTO media_streams (
    media_content_id, stream_url, stream_type, is_default, 
    quality, language, audio_languages, format, 
    drm_keys, drm_type, license_server_url, drm_headers,
    proxy_url, doh_url, origin, user_agent, referer, custom_headers
)
SELECT 
    c.id, COALESCE(c.stream_url, ''), 'main', true,
    c.quality, c.language, c.audio_languages, c.format,
    c.drm_keys, c.drm_type, c.license_server_url, c.drm_headers,
    c.proxy_url, c.doh_url, c.origin, c.user_agent, c.referer, c.custom_headers
FROM content c
WHERE c.stream_url IS NOT NULL AND c.stream_url != ''
ON CONFLICT (media_content_id, stream_type, is_default) DO NOTHING;

COMMIT;

-- IMPORTANT: ONLY AFTER VERIFYING DATA INTEGRITY, CAN YOU DROP THE TABLE.
-- DROP TABLE content;
