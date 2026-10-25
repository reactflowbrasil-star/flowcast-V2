package com.streamcore.tv.core.utils

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for extension functions
 */
class ExtensionsTest {
    
    @Test
    fun `isValidActivationCode should return true for valid 6-digit code`() {
        // Given
        val validCodes = listOf("123456", "000000", "999999", "654321")
        
        // When & Then
        validCodes.forEach { code ->
            assertTrue("Code $code should be valid", code.isValidActivationCode())
        }
    }
    
    @Test
    fun `isValidActivationCode should return false for invalid codes`() {
        // Given
        val invalidCodes = listOf(
            "",           // Empty
            "12345",      // Too short
            "1234567",    // Too long
            "12345a",     // Contains letter
            "123 456",    // Contains space
            "123-456",    // Contains dash
            "12.345"      // Contains dot
        )
        
        // When & Then
        invalidCodes.forEach { code ->
            assertFalse("Code '$code' should be invalid", code.isValidActivationCode())
        }
    }
    
    @Test
    fun `isValidEmail should return true for valid email addresses`() {
        // Given
        val validEmails = listOf(
            "test@example.com",
            "user.name@domain.co.uk",
            "user+tag@example.org",
            "123@example.com",
            "test.email.with+symbol@example.com"
        )
        
        // When & Then
        validEmails.forEach { email ->
            assertTrue("Email $email should be valid", email.isValidEmail())
        }
    }
    
    @Test
    fun `isValidEmail should return false for invalid email addresses`() {
        // Given
        val invalidEmails = listOf(
            "",                    // Empty
            "invalid",             // No @ symbol
            "@example.com",        // No local part
            "test@",               // No domain
            "test@.com",           // Invalid domain
            "test..test@example.com", // Double dots
            "test@example",        // No TLD
            "test @example.com"    // Space in email
        )
        
        // When & Then
        invalidEmails.forEach { email ->
            assertFalse("Email '$email' should be invalid", email.isValidEmail())
        }
    }
    
    @Test
    fun `formatFileSize should format bytes correctly`() {
        // Given & When & Then
        assertEquals("0 B", 0L.formatFileSize())
        assertEquals("1 B", 1L.formatFileSize())
        assertEquals("1023 B", 1023L.formatFileSize())
        assertEquals("1.0 KB", 1024L.formatFileSize())
        assertEquals("1.5 KB", 1536L.formatFileSize())
        assertEquals("1.0 MB", (1024L * 1024L).formatFileSize())
        assertEquals("1.0 GB", (1024L * 1024L * 1024L).formatFileSize())
        // Note: Implementation caps at GB, TB shows as large GB value
    }
    
    @Test
    fun `formatDuration should format seconds correctly`() {
        // Given & When & Then
        // Note: Implementation returns human-readable format like "1h 30m"
        assertEquals("<1m", 0L.formatDuration())
        assertEquals("<1m", 30L.formatDuration())
        assertEquals("1m", 60L.formatDuration())
        assertEquals("1m", 90L.formatDuration())
        assertEquals("59m", 3540L.formatDuration())
        assertEquals("1h 0m", 3600L.formatDuration())
        assertEquals("1h 30m", 5400L.formatDuration())
        assertEquals("10h 30m", 37800L.formatDuration())
    }
}
