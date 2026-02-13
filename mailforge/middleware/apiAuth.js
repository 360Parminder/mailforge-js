import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

/**
 * Middleware to validate API key authentication
 * This allows external frontends to authenticate with SHARP server
 * using API keys instead of JWT tokens
 */
export async function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: 'API key required. Include X-API-Key header.'
        });
    }

    try {
        const users = await sql`
            SELECT id, username, domain, is_banned
            FROM users 
            WHERE api_key = ${apiKey} AND is_banned = false
        `;

        if (!users.length) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key'
            });
        }

        req.user = users[0];
        req.turnstileVerified = true; // Skip Turnstile for API key auth
        next();
    } catch (error) {
        console.error('API Auth error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
}
