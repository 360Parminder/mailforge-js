import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';

const prisma = new PrismaClient();
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Middleware to validate JWT token authentication
 * This allows the app server to authenticate with MailForge server
 * using shared JWT tokens
 */
export async function validateApiKey(req, res, next) {
    const token = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token required. Include X-API-Key or Authorization header.'
        });
    }

    try {
        // Verify JWT token
        const { payload } = await jwtVerify(token, JWT_SECRET);
        
        if (!payload.id && !payload.userId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token payload'
            });
        }

        // Get user from database
        const userId = payload.id || payload.userId;
        const user = await prisma.user.findUnique({
            where: {
                id: typeof userId === 'string' ? parseInt(userId) : userId
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.is_banned || !user.active) {
            return res.status(403).json({
                success: false,
                message: 'User account is inactive or banned'
            });
        }

        req.user = user;
        req.turnstileVerified = true; // Skip Turnstile for JWT auth
        next();
    } catch (error) {
        console.error('JWT Auth error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
}
