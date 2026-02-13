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
    
    console.log('🔑 API Auth - Received headers:', {
        'x-api-key': req.headers['x-api-key'] ? 'present' : 'missing',
        'authorization': req.headers['authorization'] ? 'present' : 'missing',
        'token': token ? `${token.substring(0, 20)}...` : 'missing'
    });
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token required. Include X-API-Key or Authorization header.'
        });
    }

    try {
        console.log('🔐 Verifying JWT token...');
        console.log('🔐 JWT_SECRET available:', !!JWT_SECRET, 'length:', JWT_SECRET?.length);
        
        // Verify JWT token
        const { payload } = await jwtVerify(token, JWT_SECRET);
        console.log('✅ JWT verified. Payload:', payload);
        
        if (!payload.id && !payload.userId) {
            console.log('❌ Invalid payload - no id or userId field');
            return res.status(401).json({
                success: false,
                message: 'Invalid token payload'
            });
        }

        // Get user from database
        const userId = payload.id || payload.userId;
        console.log('🔍 Looking up user ID:', userId, 'type:', typeof userId);
        
        const user = await prisma.user.findUnique({
            where: {
                id: typeof userId === 'string' ? parseInt(userId) : userId
            }
        });

        if (!user) {
            console.log('❌ User not found in database for ID:', userId);
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('✅ User found:', user.username, 'active:', user.active, 'banned:', user.is_banned);

        if (user.is_banned || !user.active) {
            return res.status(403).json({
                success: false,
                message: 'User account is inactive or banned'
            });
        }

        req.user = user;
        req.turnstileVerified = true; // Skip Turnstile for JWT auth
        console.log('✅ Authentication successful for user:', user.username);
        next();
    } catch (error) {
        console.error('❌ JWT Auth error:', error.message);
        console.error('Full error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.message
        });
    }
}
