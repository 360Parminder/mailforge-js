import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import postgres from 'postgres';
import { sendToTraditionalEmail } from './email-bridge.js';
import { parseSharpAddress, resolveSrv } from './dns-utils.js';
import net from 'net';

const sql = postgres(process.env.DATABASE_URL);
const DOMAIN = process.env.DOMAIN_NAME || 'localhost';
const SMTP_PORT = +process.env.SMTP_PORT || 587;

// SMTP Server for traditional email clients
export function createSMTPServer() {
    const server = new SMTPServer({
        authOptional: false,
        secure: false, // Use STARTTLS instead
        allowInsecureAuth: true,
        
        onAuth(auth, session, callback) {
            // Authenticate using username#domain format or API key
            authenticateUser(auth.username, auth.password)
                .then(user => {
                    if (user) {
                        session.user = user;
                        callback(null, { user: user.username });
                    } else {
                        callback(new Error('Invalid username or password'));
                    }
                })
                .catch(err => callback(err));
        },

        onData(stream, session, callback) {
            simpleParser(stream, async (err, parsed) => {
                if (err) {
                    console.error('Error parsing email:', err);
                    return callback(err);
                }

                try {
                    const from = `${session.user.username}@${session.user.domain}`;
                    const to = parsed.to?.value?.[0]?.address || '';
                    const subject = parsed.subject || '(No Subject)';
                    const textBody = parsed.text || '';
                    const htmlBody = parsed.html || '';
                    
                    console.log('\n' + '='.repeat(80));
                    console.log(`📧 SMTP CLIENT EMAIL`);
                    console.log('='.repeat(80));
                    console.log(`From: ${from}`);
                    console.log(`To: ${to}`);
                    console.log(`Subject: ${subject}`);
                    console.log(`Body Length: ${textBody.length} chars`);
                    console.log(`Time: ${new Date().toISOString()}`);
                    console.log('='.repeat(80));

                    // All addresses use @ format now
                    if (to.includes('@')) {
                        const [toUser, toDomain] = to.split('@');
                        
                        // Check if it's for our domain (local delivery)
                        if (toDomain === DOMAIN) {
                            console.log(`📥 Local delivery to ${to}`);
                            await sendLocally(from, to, subject, textBody, htmlBody);
                        } else {
                            // External delivery - send directly to recipient's mail server
                            console.log(`📤 External delivery to ${to} (${toDomain})`);
                            await sendToTraditionalEmail(from, to, subject, textBody, htmlBody);
                        }
                    } else {
                        throw new Error('Invalid recipient address format');
                    }

                    console.log('='.repeat(80) + '\n');
                    callback();
                } catch (error) {
                    console.error('Error processing email:', error);
                    callback(error);
                }
            });
        }
    });

    server.listen(SMTP_PORT, () => {
        console.log(`SMTP server listening on port ${SMTP_PORT}`);
    });

    return server;
}

// Authenticate user with username/password or API key
async function authenticateUser(username, password) {
    try {
        // Try API key authentication first
        const apiKeyUser = await sql`
            SELECT id, username, domain, is_banned
            FROM users
            WHERE api_key = ${password} AND is_banned = false
        `;
        
        if (apiKeyUser.length > 0) {
            return apiKeyUser[0];
        }

        // Try username@domain and password
        let user, domain;
        if (username.includes('@')) {
            [user, domain] = username.split('@');
        } else {
            user = username;
            domain = DOMAIN;
        }

        // Simple password hash verification (in production use bcrypt)
        const { createHash } = await import('crypto');
        const passwordHash = createHash('sha256').update(password).digest('hex');

        const users = await sql`
            SELECT id, username, domain, is_banned
            FROM users
            WHERE username = ${user}
            AND domain = ${domain}
            AND password_hash = ${passwordHash}
            AND is_banned = false
        `;

        return users.length > 0 ? users[0] : null;
    } catch (error) {
        console.error('Authentication error:', error);
        return null;
    }
}

// Send to local user
async function sendLocally(from, to, subject, textBody, htmlBody) {
    const [toUser, toDomain] = to.split('@');
    const [fromUser, fromDomain] = from.split('@');
    
    // Verify recipient exists
    const users = await sql`
        SELECT id FROM users 
        WHERE username = ${toUser} AND domain = ${toDomain}
    `;
    
    if (users.length === 0) {
        console.log(`❌ ERROR: Recipient ${to} not found on this server`);
        throw new Error('Recipient not found on this server');
    }

    const result = await sql`
        INSERT INTO emails (
            from_address, from_domain, to_address, to_domain,
            subject, body, html_body, content_type, status, sent_at
        ) VALUES (
            ${from}, ${fromDomain}, ${to}, ${toDomain},
            ${subject}, ${textBody}, ${htmlBody}, 'text/html', 'sent', NOW()
        )
        RETURNING id
    `;
    
    console.log(`✅ Email #${result[0].id} delivered locally to ${to}`);
}

// Legacy SHARP protocol sending (kept for compatibility, now using standard email format)
async function sendViaSHARP(from, to, subject, textBody, htmlBody) {
    const PROTOCOL_VERSION = 'SHARP/1.3';
    
    try {
        const tp = parseSharpAddress(to);
        const fp = parseSharpAddress(from);

        // Check if local delivery
        if (tp.domain === DOMAIN) {
            // Local delivery
            const users = await sql`
                SELECT id FROM users 
                WHERE username = ${tp.username} AND domain = ${tp.domain}
            `;
            
            if (users.length === 0) {
                throw new Error('Recipient not found on this server');
            }

            await sql`
                INSERT INTO emails (
                    from_address, from_domain, to_address, to_domain,
                    subject, body, html_body, content_type, status, sent_at
                ) VALUES (
                    ${from}, ${fp.domain}, ${to}, ${tp.domain},
                    ${subject}, ${textBody}, ${htmlBody}, 'text/html', 'sent', NOW()
                )
            `;
            
            console.log(`SMTP->SHARP: Local delivery to ${to}`);
            return;
        }

        // Remote delivery via SHARP protocol
        const srvRecords = await resolveSrv(tp.domain);
        if (!srvRecords || srvRecords.length === 0) {
            throw new Error(`No SHARP server found for domain ${tp.domain}`);
        }

        const srv = srvRecords[0];
        const client = net.createConnection({ host: srv.name, port: srv.port });

        return new Promise((resolve, reject) => {
            let buffer = '';

            client.on('data', (data) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                lines.forEach(line => {
                    console.log(`SHARP<: ${line}`);
                });
            });

            client.on('connect', () => {
                console.log(`SMTP->SHARP: Connected to ${srv.name}:${srv.port}`);
                client.write(`${PROTOCOL_VERSION}\n`);
                client.write(`TO: ${to}\n`);
                client.write(`FROM: ${from}\n`);
                client.write(`SUBJECT: ${subject}\n`);
                client.write(`CONTENT-TYPE: text/html\n`);
                client.write(`BODY-START\n`);
                client.write(htmlBody || textBody);
                client.write(`\nBODY-END\n`);
            });

            client.on('close', () => {
                console.log(`SMTP->SHARP: Email sent to ${to}`);
                resolve();
            });

            client.on('error', (err) => {
                console.error(`SMTP->SHARP error:`, err);
                reject(err);
            });
        });

    } catch (error) {
        console.error('Error sending via SHARP:', error);
        throw error;
    }
}
