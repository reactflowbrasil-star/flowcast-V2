/**
 * Crypto utilities for API response encryption/decryption.
 *
 * Uses Web Crypto API (SubtleCrypto) for AES-256-GCM decryption
 * and HMAC-SHA256 signature generation.
 */

// The encryption key is injected at build time via environment variable
const ENCRYPTION_KEY_HEX: string =
    typeof globalThis !== 'undefined' && typeof (globalThis as any).process !== 'undefined'
        ? ((globalThis as any).process.env?.NEXT_PUBLIC_API_ENCRYPTION_KEY ?? '')
        : '';

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Check if API encryption is configured
 */
export function isEncryptionEnabled(): boolean {
    return ENCRYPTION_KEY_HEX.length === 64;
}

/**
 * Compute HMAC-SHA256 signature for a request.
 * Signature = HMAC-SHA256(key, "<timestamp>:<METHOD>:<path>")
 */
export async function computeHmacSignature(
    method: string,
    path: string,
    timestamp: string
): Promise<string> {
    if (!isEncryptionEnabled()) return '';

    const keyBytes = hexToBytes(ENCRYPTION_KEY_HEX);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes as unknown as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const message = `${timestamp}:${method}:${path}`;
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));

    return bytesToHex(new Uint8Array(signature));
}

/**
 * Decrypt an AES-256-GCM encrypted API response.
 *
 * The encrypted payload is base64-encoded: nonce (12 bytes) + ciphertext + tag (16 bytes)
 */
export async function decryptApiResponse(base64Body: string): Promise<string> {
    const keyBytes = hexToBytes(ENCRYPTION_KEY_HEX);

    // Decode base64 to bytes
    const binaryStr = atob(base64Body);
    const combined = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        combined[i] = binaryStr.charCodeAt(i);
    }

    if (combined.length < 12) {
        throw new Error('Encrypted payload too short');
    }

    // Split: first 12 bytes = nonce/IV, rest = ciphertext + GCM tag
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Import the key for AES-GCM decryption
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes as unknown as ArrayBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
        cryptoKey,
        ciphertext as unknown as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
}
