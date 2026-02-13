#!/usr/bin/env bun
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        envVars[key] = value;
        process.env[key] = value;
    }
});

const DATABASE_URL = envVars.DATABASE_URL || process.env.DATABASE_URL;
const DOMAIN_NAME = envVars.DOMAIN_NAME || 'localhost';

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env file');
    process.exit(1);
}

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           MailForge User Creation Tool                  ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log();

// Get username from command line or prompt
const args = process.argv.slice(2);
const username = args[0] || 'admin';

console.log(`👤 Creating user: ${username}@${DOMAIN_NAME}`);
console.log();

const sql = postgres(DATABASE_URL);

async function createUser() {
    try {
        // Simple password hash (in production, use proper bcrypt)
        const password = Math.random().toString(36).slice(-12);
        const passwordHash = createHash('sha256').update(password).digest('hex');
        
        // Check if user exists
        const existing = await sql`
            SELECT id FROM users WHERE username = ${username} AND domain = ${DOMAIN_NAME}
        `;
        
        if (existing.length > 0) {
            console.log('⚠️  User already exists. Generating new API key...');
            const userId = existing[0].id;
            
            // Generate API key
            const apiKey = await sql`SELECT generate_api_key(${userId}) as key`;
            
            console.log();
            console.log('✅ API Key generated successfully!');
            console.log();
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📧 Email Address:', `${username}@${DOMAIN_NAME}`);
            console.log('🔑 API Key:', apiKey[0].key);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log();
            return;
        }
        
        // Create new user
        const result = await sql`
            INSERT INTO users (username, domain, password_hash, is_banned, created_at)
            VALUES (${username}, ${DOMAIN_NAME}, ${passwordHash}, false, NOW())
            RETURNING id
        `;
        
        const userId = result[0].id;
        console.log(`✅ User created with ID: ${userId}`);
        
        // Generate API key
        const apiKey = await sql`SELECT generate_api_key(${userId}) as key`;
        
        console.log();
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              User Created Successfully!                  ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log();
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email Address:', `${username}@${DOMAIN_NAME}`);
        console.log('🔑 API Key:', apiKey[0].key);
        console.log('🔒 Password (temporary):', password);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log();
        console.log('⚠️  IMPORTANT: Save the API key securely! You won\'t be able to see it again.');
        console.log();
        console.log('📝 Test the API:');
        console.log(`   curl -X POST http://localhost:${envVars.HTTP_PORT || 5501}/send \\`);
        console.log(`     -H 'X-API-Key: ${apiKey[0].key}' \\`);
        console.log(`     -H 'Content-Type: application/json' \\`);
        console.log(`     -d '{"from":"${username}@${DOMAIN_NAME}","to":"test@example.com","subject":"Test","body":"Hello"}'`);
        console.log();
        
    } catch (error) {
        console.error('❌ Error creating user:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

console.log('Usage: bun run create-user.js [username]');
console.log('Example: bun run create-user.js myuser 120');
console.log();

createUser();
