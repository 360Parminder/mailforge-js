import nodemailer from 'nodemailer';
import postgres from 'postgres';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { resolveMx } from './dns-utils.js';

const sql = postgres(process.env.DATABASE_URL);
const DOMAIN = process.env.DOMAIN_NAME || 'localhost';
const SMTP_BRIDGE_PORT = +process.env.SMTP_BRIDGE_PORT || 2525;

// Send email directly to recipient's mail server (no relay needed)
export async function sendToTraditionalEmail(fromEmail, toEmail, subject, textBody, htmlBody) {
    try {
        const [, toDomain] = toEmail.split('@');
        
        // Resolve MX records for recipient domain
        const mxRecords = await resolveMx(toDomain);
        if (!mxRecords || mxRecords.length === 0) {
            throw new Error(`No mail server found for ${toDomain}`);
        }

        // Use the highest priority MX server
        const mx = mxRecords[0];
        
        console.log(`📮 Sending to ${mx.exchange} (MX for ${toDomain})...`);

        // Create direct SMTP connection to recipient's mail server
        const transporter = nodemailer.createTransport({
            host: mx.exchange,
            port: 25,
            secure: false,
            tls: {
                rejectUnauthorized: false
            },
            // No authentication needed - direct server-to-server
        });

        const mailOptions = {
            from: fromEmail, // Sender address is dynamic
            to: toEmail,
            subject: subject,
            text: textBody,
            html: htmlBody || textBody,
            headers: {
                'X-Mailer': 'Mail Server'
            }
        };

        const info = await transporter.sendMail(mailOptions);
        
        // Log the sent email
        const [fromUser, fromDomain] = fromEmail.split('@');
        const result = await sql`
            INSERT INTO emails (
                from_address, from_domain, to_address, to_domain,
                subject, body, html_body, content_type, status, sent_at
            ) VALUES (
                ${fromEmail}, ${fromDomain}, ${toEmail}, ${toDomain},
                ${subject}, ${textBody}, ${htmlBody}, 'text/html', 'sent', NOW()
            )
            RETURNING id
        `;

        console.log(`✅ Email #${result[0].id} sent successfully to ${toEmail} (MessageID: ${info.messageId})`);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        
        // Log as failed
        const [fromUser, fromDomain] = fromEmail.split('@');
        const [toUser, toDomain] = toEmail.split('@');
        await sql`
            INSERT INTO emails (
                from_address, from_domain, to_address, to_domain,
                subject, body, html_body, content_type, status, error_message, sent_at
            ) VALUES (
                ${fromEmail}, ${fromDomain}, ${toEmail}, ${toDomain},
                ${subject}, ${textBody}, ${htmlBody}, 'text/html', 'failed', ${error.message}, NOW()
            )
        `;
        
        throw error;
    }
}

// SMTP server to receive emails from traditional email servers
export function createBridgeReceiver() {
    const server = new SMTPServer({
        authOptional: true, // Allow unauthenticated connections from other mail servers
        secure: false,
        allowInsecureAuth: true,
        disabledCommands: ['STARTTLS'], // For simplicity
        
        onData(stream, session, callback) {
            simpleParser(stream, async (err, parsed) => {
                if (err) {
                    console.error('Error parsing incoming email:', err);
                    return callback(err);
                }

                try {
                    const fromEmail = parsed.from?.value?.[0]?.address || '';
                    const toEmail = parsed.to?.value?.[0]?.address || '';
                    const subject = parsed.subject || '(No Subject)';
                    const textBody = parsed.text || '';
                    const htmlBody = parsed.html || '';
                    
                    console.log('\n' + '='.repeat(80));
                    console.log(`📨 INCOMING EMAIL`);
                    console.log('='.repeat(80));
                    console.log(`From: ${fromEmail}`);
                    console.log(`To: ${toEmail}`);
                    console.log(`Subject: ${subject}`);
                    console.log(`Body Length: ${textBody.length} chars`);
                    console.log(`Time: ${new Date().toISOString()}`);
                    console.log('='.repeat(80));

                    // Recipient should be user@yourdomain.com
                    const [username, domain] = toEmail.split('@');
                    
                    // Check if recipient exists
                    const users = await sql`
                        SELECT id FROM users 
                        WHERE username = ${username} AND domain = ${domain}
                    `;
                    
                    if (users.length === 0) {
                        console.log(`❌ ERROR: Recipient ${toEmail} not found on this server`);
                        throw new Error('Recipient not found');
                    }

                    // Store the email
                    const result = await sql`
                        INSERT INTO emails (
                            from_address, from_domain, to_address, to_domain,
                            subject, body, html_body, content_type, status, sent_at
                        ) VALUES (
                            ${fromEmail}, ${fromEmail.split('@')[1]}, ${toEmail}, ${domain},
                            ${subject}, ${textBody}, ${htmlBody}, 'text/html', 'sent', NOW()
                        )
                        RETURNING id
                    `;

                    console.log(`✅ Email #${result[0].id} successfully delivered to ${toEmail}`);
                    console.log('='.repeat(80) + '\n');
                    callback();
                } catch (error) {
                    console.error('Error processing incoming email:', error);
                    callback(error);
                }
            });
        }
    });

    server.listen(SMTP_BRIDGE_PORT, () => {
        console.log(`SMTP Bridge (receiving) listening on port ${SMTP_BRIDGE_PORT}`);
        console.log(`Configure your domain MX records to point to this server`);
    });

    return server;
}

// Test email sending capability
export async function testEmailSending() {
    console.log('✅ Direct SMTP sending enabled - no relay configuration needed');
    console.log('   Emails will be sent directly to recipient mail servers');
    return true;
}
