# Complete Setup Guide for kosh.uno Mail Server (MailForge)

## Overview
This guide will help you set up a complete, production-ready mail server for **kosh.uno** using MailForge that can send and receive emails just like Gmail.

## Prerequisites
- A server with a static IP address
- Domain: kosh.uno
- Port 25, 587, 143, 2525, 5000, 5001 accessible
- Docker installed (or Bun for standalone)

## Step 1: DNS Configuration

Add these DNS records to your kosh.uno domain:

### Required Records

**MX Record** (tells other mail servers where to deliver emails for kosh.uno):
```
kosh.uno.           3600  IN  MX  10  mail.kosh.uno.
```

**A Record** (points mail.kosh.uno to your server):
```
mail.kosh.uno.      3600  IN  A   YOUR_SERVER_IP
```

**SPF Record** (prevents spam classification):
```
kosh.uno.           3600  IN  TXT "v=spf1 mx ~all"
```

### Optional but Recommended

**DMARC Record** (email authentication):
```
_dmarc.kosh.uno.    3600  IN  TXT "v=DMARC1; p=none; rua=mailto:postmaster@kosh.uno"
```

**PTR Record** (reverse DNS - ask your hosting provider):
```
YOUR_SERVER_IP.in-addr.arpa.  3600  IN  PTR  mail.kosh.uno.
```

## Step 2: Install Dependencies

```bash
cd mailforge
bun install
```

## Step 3: Initialize Server

```bash
cd mailforge
bash database/init.sh
```

When prompted, enter: `kosh.uno`

## Step 4: Update .env File

Edit `mailforge/.env`:
```bash
DOMAIN_NAME=kosh.uno
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres
SHARP_PORT=5000
HTTP_PORT=5001

# Email protocol ports
SMTP_PORT=587
IMAP_PORT=143
SMTP_BRIDGE_PORT=2525

# Enable all servers
ENABLE_SMTP_SERVER=true
ENABLE_IMAP_SERVER=true
ENABLE_EMAIL_BRIDGE=true

# Turnstile (optional)
PRIVATE_TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# JWT Secret (generate with: openssl rand -hex 64)
JWT_SECRET=your_random_secret_here
```

## Step 5: Start the Server

### Using Docker:
```bash
docker compose up -d
```

### Using Bun directly:
```bash
cd mailforge
bun main.js
```

## Step 6: Create Email Accounts

```bash
cd mailforge
bun run create-user.js john
```

This creates: `john@kosh.uno`

Save the API key shown - you'll need it for email clients!

## Step 7: Configure Email Clients

### Thunderbird Setup:
1. Add new account
2. **Email:** john@kosh.uno
3. **Incoming (IMAP):**
   - Server: mail.kosh.uno
   - Port: 143
   - Username: john@kosh.uno
   - Password: [your-password or API key]
   - Connection security: None
4. **Outgoing (SMTP):**
   - Server: mail.kosh.uno
   - Port: 587
   - Username: john@kosh.uno
   - Password: [your-password or API key]
   - Connection security: None

### Outlook Setup:
Similar to above, use:
- Incoming: IMAP, mail.kosh.uno, port 143
- Outgoing: SMTP, mail.kosh.uno, port 587

## Step 8: Test Email Sending

### Send to Gmail:
```bash
curl -X POST http://localhost:5001/send \
  -H 'X-API-Key: your-api-key-here' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "john@kosh.uno",
    "to": "someone@gmail.com",
    "subject": "Test from kosh.uno",
    "body": "Hello from my own mail server!",
    "hashcash": "1:5:250213:someone@gmail.com::abc:123"
  }'
```

### Receive from Gmail:
Gmail users can send emails to `john@kosh.uno` and they'll be delivered to your server!

## Step 9: Port Forwarding

Make sure these ports are open on your firewall:

```bash
# For email clients (Thunderbird, Outlook)
587   - SMTP (sending)
143   - IMAP (receiving)

# For receiving from external mail servers
2525  - SMTP Bridge (or port 25)

# For server-to-server communication
5000  - Mail protocol
5001  - HTTP API
```

## Troubleshooting

### Emails not being delivered?

**Check MX records:**
```bash
dig MX kosh.uno
```

**Check if your IP is blacklisted:**
Visit: https://mxtoolbox.com/blacklists.aspx

**Check logs:**
```bash
docker compose logs -f mailforge
```

### Can't send to Gmail?

Gmail may initially mark your emails as spam. To improve delivery:
1. Set up SPF, DKIM, and DMARC records
2. Start by sending to yourself at Gmail
3. Mark your emails as "Not Spam"
4. Gradually increase sending volume

### Port 25 blocked?

Many ISPs block port 25. Use port 2525 instead:
```bash
SMTP_BRIDGE_PORT=2525
```

And update your firewall to forward port 25 to 2525.

## Production Recommendations

1. **Use TLS/SSL**: Add Let's Encrypt certificates
2. **Set up DKIM**: Cryptographically sign your emails
3. **Monitor logs**: Set up log aggregation
4. **Backup database**: Regular PostgreSQL backups
5. **Rate limiting**: Prevent abuse
6. **Spam filtering**: Add SpamAssassin or similar

## How It Works

```
┌─────────────┐                          ┌──────────────┐
│   Gmail     │──────  Internet  ────────│  kosh.uno    │
│  User sends │                          │  Mail Server │
│  to kosh.uno│                          │  Port 2525   │
└─────────────┘                          └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  PostgreSQL  │
                                         │   Database   │
                                         └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ IMAP Server  │
                                         │   Port 143   │
                                         └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ Thunderbird  │
                                         │   Fetches    │
                                         └──────────────┘
```

## Support

For issues, check:
- Server logs: `docker compose logs -f`
- DNS propagation: https://dnschecker.org
- MX records: `dig MX kosh.uno`
- Port accessibility: `telnet mail.kosh.uno 25`

## Next Steps

- Set up webmail interface
- Configure automatic backups
- Add spam filtering
- Set up monitoring and alerts
- Configure email aliases
- Set up catch-all addresses

Your mail server is now ready to send and receive emails to/from anyone in the world! 🎉
