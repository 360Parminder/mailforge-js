#!/usr/bin/env bun
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

console.log('🔑 Updating API key generation function...');
const sql = postgres(DATABASE_URL);

try {
    // Just update the function
    await sql`
        CREATE OR REPLACE FUNCTION generate_api_key(user_id INTEGER) 
        RETURNS VARCHAR(64) AS $$
        DECLARE
            new_key VARCHAR(64);
        BEGIN
            new_key := md5(random()::text || clock_timestamp()::text || user_id::text) || 
                       md5(random()::text || clock_timestamp()::text || user_id::text);
            UPDATE users SET api_key = new_key WHERE id = user_id;
            RETURN new_key;
        END;
        $$ LANGUAGE plpgsql;
    `;
    
    console.log('✅ Function updated successfully');
    await sql.end();
} catch (e) {
    console.error('Error:', e.message);
    await sql.end();
    process.exit(1);
}
