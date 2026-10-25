# Vendor bundles for players (no CDN)

Bundled files in this directory:

- hls.min.js (hls.js v1.5.7, Apache-2.0)
- shaka-player.compiled.min.js (Shaka Player v4.9.6, Apache-2.0)

Official releases:
- hls.js: https://github.com/video-dev/hls.js/releases
- Shaka Player: https://github.com/shaka-project/shaka-player/releases

License text:
- /licenses/APACHE-2.0.txt

Notes:
- CSP: current configuration allows script-src 'self' so local vendor scripts will load.
- If you replace or update these files, update version notes and third-party license reports.
