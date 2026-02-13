import net from 'net';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);
const DOMAIN = process.env.DOMAIN_NAME || 'localhost';
const IMAP_PORT = +process.env.IMAP_PORT || 143;

// Simple IMAP server implementation
export function createIMAPServer() {
    const server = net.createServer((socket) => {
        console.log('IMAP: Client connected');
        
        let authenticated = false;
        let user = null;
        let selectedFolder = null;
        let tagCounter = 0;

        // Send greeting
        socket.write('* OK MailForge IMAP Server Ready\r\n');

        socket.on('data', async (data) => {
            const commands = data.toString().split('\r\n').filter(cmd => cmd.trim());
            
            for (const command of commands) {
                await handleIMAPCommand(socket, command, { authenticated, user, selectedFolder });
            }
        });

        socket.on('error', (err) => {
            console.error('IMAP socket error:', err);
        });

        socket.on('end', () => {
            console.log('IMAP: Client disconnected');
        });
    });

    server.listen(IMAP_PORT, () => {
        console.log(`IMAP server listening on port ${IMAP_PORT}`);
    });

    return server;
}

async function handleIMAPCommand(socket, command, state) {
    const parts = command.match(/^(\w+)\s+(\w+)\s*(.*)$/);
    if (!parts) {
        socket.write(`* BAD Invalid command\r\n`);
        return;
    }

    const [, tag, cmd, args] = parts;
    const cmdUpper = cmd.toUpperCase();

    console.log(`IMAP<: ${command}`);

    try {
        switch (cmdUpper) {
            case 'CAPABILITY':
                socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n');
                socket.write(`${tag} OK CAPABILITY completed\r\n`);
                break;

            case 'LOGIN':
                const loginMatch = args.match(/"?([^"\s]+)"?\s+"?([^"\s]+)"?/);
                if (!loginMatch) {
                    socket.write(`${tag} NO Invalid login credentials\r\n`);
                    return;
                }
                
                const [, username, password] = loginMatch;
                const authenticatedUser = await authenticateUser(username, password);
                
                if (authenticatedUser) {
                    state.authenticated = true;
                    state.user = authenticatedUser;
                    socket.write(`${tag} OK LOGIN completed\r\n`);
                } else {
                    socket.write(`${tag} NO LOGIN failed\r\n`);
                }
                break;

            case 'LIST':
                if (!state.authenticated) {
                    socket.write(`${tag} NO Not authenticated\r\n`);
                    return;
                }
                socket.write('* LIST () "/" "INBOX"\r\n');
                socket.write('* LIST () "/" "Sent"\r\n');
                socket.write('* LIST () "/" "Drafts"\r\n');
                socket.write('* LIST () "/" "Spam"\r\n');
                socket.write('* LIST () "/" "Starred"\r\n');
                socket.write(`${tag} OK LIST completed\r\n`);
                break;

            case 'SELECT':
            case 'EXAMINE':
                if (!state.authenticated) {
                    socket.write(`${tag} NO Not authenticated\r\n`);
                    return;
                }
                
                const folder = args.replace(/"/g, '').trim();
                state.selectedFolder = folder;
                
                const count = await getEmailCount(state.user, folder);
                socket.write(`* ${count} EXISTS\r\n`);
                socket.write(`* ${count} RECENT\r\n`);
                socket.write('* OK [UIDVALIDITY 1] UIDs valid\r\n');
                socket.write(`* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n`);
                socket.write(`${tag} OK [READ-WRITE] SELECT completed\r\n`);
                break;

            case 'FETCH':
                if (!state.authenticated || !state.selectedFolder) {
                    socket.write(`${tag} NO Not authenticated or no folder selected\r\n`);
                    return;
                }
                
                await fetchEmails(socket, tag, args, state.user, state.selectedFolder);
                break;

            case 'LOGOUT':
                socket.write('* BYE IMAP4rev1 Server logging out\r\n');
                socket.write(`${tag} OK LOGOUT completed\r\n`);
                socket.end();
                break;

            case 'NOOP':
                socket.write(`${tag} OK NOOP completed\r\n`);
                break;

            default:
                socket.write(`${tag} BAD Command not recognized\r\n`);
        }
    } catch (error) {
        console.error('IMAP command error:', error);
        socket.write(`${tag} NO Command failed: ${error.message}\r\n`);
    }
}

async function authenticateUser(username, password) {
    try {
        // Try API key
        const apiKeyUser = await sql`
            SELECT id, username, domain, is_banned
            FROM users
            WHERE api_key = ${password} AND is_banned = false
        `;
        
        if (apiKeyUser.length > 0) {
            return apiKeyUser[0];
        }

        // Try username@domain
        let user, domain;
        if (username.includes('@')) {
            [user, domain] = username.split('@');
        } else {
            user = username;
            domain = DOMAIN;
        }

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
        console.error('IMAP authentication error:', error);
        return null;
    }
}

async function getEmailCount(user, folder) {
    const address = `${user.username}@${user.domain}`;
    
    let query;
    switch (folder.toUpperCase()) {
        case 'INBOX':
            query = sql`
                SELECT COUNT(*) as count FROM emails 
                WHERE to_address = ${address} 
                AND status NOT IN ('spam', 'scheduled')
            `;
            break;
        case 'SENT':
            query = sql`
                SELECT COUNT(*) as count FROM emails 
                WHERE from_address = ${address} 
                AND status = 'sent'
            `;
            break;
        case 'DRAFTS':
            query = sql`
                SELECT COUNT(*) as count FROM email_drafts 
                WHERE user_id = ${user.id}
            `;
            break;
        case 'SPAM':
            query = sql`
                SELECT COUNT(*) as count FROM emails 
                WHERE to_address = ${address} 
                AND status = 'spam'
            `;
            break;
        case 'STARRED':
            query = sql`
                SELECT COUNT(*) as count FROM email_stars 
                WHERE user_id = ${user.id}
            `;
            break;
        default:
            query = sql`SELECT 0 as count`;
    }
    
    const result = await query;
    return result[0]?.count || 0;
}

async function fetchEmails(socket, tag, args, user, folder) {
    const address = `${user.username}@${user.domain}`;
    
    // Parse FETCH command (simplified)
    const rangeMatch = args.match(/^(\d+):(\*|\d+)/);
    if (!rangeMatch) {
        socket.write(`${tag} BAD Invalid FETCH range\r\n`);
        return;
    }

    let emails;
    switch (folder.toUpperCase()) {
        case 'INBOX':
            emails = await sql`
                SELECT * FROM emails 
                WHERE to_address = ${address} 
                AND status NOT IN ('spam', 'scheduled')
                ORDER BY sent_at DESC
                LIMIT 50
            `;
            break;
        case 'SENT':
            emails = await sql`
                SELECT * FROM emails 
                WHERE from_address = ${address} 
                AND status = 'sent'
                ORDER BY sent_at DESC
                LIMIT 50
            `;
            break;
        default:
            emails = [];
    }

    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const seqNum = i + 1;
        
        // Simple FETCH response with envelope and body structure
        const date = new Date(email.sent_at).toUTCString();
        const size = (email.body || '').length + (email.html_body || '').length;
        
        socket.write(`* ${seqNum} FETCH (UID ${email.id} RFC822.SIZE ${size} ENVELOPE ("${date}" "${email.subject}" ((NIL NIL "${email.from_address.split('@')[0]}" "${email.from_address.split('@')[1]}")) ((NIL NIL "${email.from_address.split('@')[0]}" "${email.from_address.split('@')[1]}")) ((NIL NIL "${email.to_address.split('@')[0]}" "${email.to_address.split('@')[1]}")) ((NIL NIL "${email.to_address.split('@')[0]}" "${email.to_address.split('@')[1]}")) NIL NIL NIL NIL))\r\n`);
    }

    socket.write(`${tag} OK FETCH completed\r\n`);
}
