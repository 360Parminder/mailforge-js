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

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env file');
    process.exit(1);
}

console.log('🔗 Connecting to database...');
const sql = postgres(DATABASE_URL);

async function initializeDatabase() {
    try {
        // Note: Database schema is managed by Prisma migrations from the app server
        // This script only verifies the database connection
        
        console.log('🔍 Verifying database connection...');
        
        // Check tables
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `;
        
        console.log('\n📋 Database tables:');
        tables.forEach(t => console.log(`  - ${t.table_name}`));
        
        console.log('\n✅ Database connection verified!');
        console.log('\n📝 Note: Database schema is managed by Prisma migrations from your app server');
        console.log('\n📝 Next steps:');
        console.log('1. Ensure Prisma migrations are applied on app server');
        console.log('2. Create a user account: bun run create-user.js');
        console.log('3. Start the server: bun main.js');
        
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

initializeDatabase();
