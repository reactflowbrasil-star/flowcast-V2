import { NextRequest, NextResponse } from 'next/server';
import { hasAuth, requireAuthEnabled, validateUpstreamUrl } from '../proxyUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Subtitle proxy and converter API route.
 * 
 * IMPORTANT: This API route requires a Node.js server runtime to proxy and convert subtitle files.
 * The 'force-dynamic' export above ensures this route runs at runtime.
 */

// Convert SRT format to WebVTT format
function srtToWebVtt(srtContent: string): string {
  // Add WebVTT header
  let webvtt = 'WEBVTT\n\n';

  // Split into subtitle blocks
  const blocks = srtContent.trim().split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // Skip the sequence number (first line)
    const timeLine = lines[1];
    const textLines = lines.slice(2);

    // Convert SRT timestamp format to WebVTT format
    // SRT: 00:01:24,667 --> 00:01:26,043
    // WebVTT: 00:01:24.667 --> 00:01:26.043
    const webvttTimeLine = timeLine.replace(/,/g, '.');

    // Add cue to WebVTT
    webvtt += `${webvttTimeLine}\n`;
    webvtt += `${textLines.join('\n')}\n\n`;
  }

  return webvtt;
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    if (requireAuthEnabled() && !(await hasAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow same-origin /api/* paths (used for internal subtitle endpoints behind rewrites),
    // but block arbitrary relative URLs. External URLs must pass allowlist validation.
    let upstreamUrl: URL;
    if (url.startsWith('/')) {
      if (!url.startsWith('/api/')) {
        return NextResponse.json({ error: 'Only /api/* relative paths are allowed' }, { status: 400 });
      }
      upstreamUrl = new URL(`${request.nextUrl.protocol}//${request.nextUrl.host}${url}`);
    } else {
      const validated = validateUpstreamUrl(url);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: validated.status });
      }
      upstreamUrl = validated.url;
    }

    // Fetch the original subtitle file
    const response = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        // Forward authorization if needed
        ...(request.headers.get('cookie') ? { 'Cookie': request.headers.get('cookie')! } : {})
      }
    });

    if (!response.ok) {
      console.error('🎬 Failed to fetch subtitle:', response.status, response.statusText);
      return NextResponse.json({ error: 'Failed to fetch subtitle' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';
    const content = await response.text();


    let finalContent = content;
    const finalContentType = 'text/vtt; charset=utf-8';

    // Convert SRT to WebVTT if needed
    if (contentType.includes('subrip') || contentType.includes('srt') ||
      content.includes('-->') && !content.startsWith('WEBVTT')) {
      finalContent = srtToWebVtt(content);
    } else if (contentType.includes('vtt') || content.startsWith('WEBVTT')) {
    } else {
      finalContent = srtToWebVtt(content);
    }

    // Return with proper headers for subtitle consumption
    return new NextResponse(finalContent, {
      headers: {
        'Content-Type': finalContentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    console.error('🎬 Subtitle proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
