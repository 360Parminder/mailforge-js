#!/usr/bin/env node
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

async function runMigration() {
    try {
        console.log('Running add-api-keys migration...');
        
        const migrationPath = join(__dirname, 'database/migrations/add-api-keys.sql');
        const migrationSQL = readFileSync(migrationPath, 'utf-8');
        
        // Execute the migration
        await sql.unsafe(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        console.log('API key column added to users table');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
