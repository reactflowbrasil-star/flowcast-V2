This folder contains third‑party license texts that require redistribution in many commercial packages.

Included here (based on current dependencies):

1) **LGPL‑2.1**  
   - Used by: FFmpeg‑based decoders (Media3 FFmpeg Extension).  
   - File: `LGPL-2.1.txt`  
   - Note: FFmpeg licensing can be LGPL or GPL depending on build flags. The media3‑ffmpeg‑decoder ships under LGPL.

2) **Apache‑2.0**  
   - Used by: AndroidX/Jetpack libraries (Compose, Media3/ExoPlayer, Hilt, Room, Navigation, etc.) and many Kotlin/Google libraries.  
   - File: `APACHE-2.0.txt`

Project license:
- The overall project is licensed under the Envato Market licenses; see the root `LICENSE` file.

This folder is not an exhaustive bill of materials. Before publishing, generate and include full dependency license reports as described in `../documentation/legal/THIRD_PARTY_LICENSES.md`.

Android note:
- The Android build keeps one copy of common license texts in the APK/AAB (do not exclude `META-INF/AL2.0` / `META-INF/LGPL2.1`).
