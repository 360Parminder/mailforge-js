# SHARP Standalone Server

Run SHARP as an independent email server with API key authentication for any frontend.

## 🚀 Quick Start

```bash
cd SHARP
bash setup-standalone.sh
```

This will:
- Initialize the PostgreSQL database
- Install dependencies
- Set up API key authentication
- Configure CORS for external frontends
- Create necessary environment variables

## 📋 Configuration

After running setup, edit `SHARP/.env`:

```env
# Your domain name
DOMAIN_NAME=yourdomain.com

# PostgreSQL database connection
DATABASE_URL=postgres://user:password@localhost:5432/postgres

# Server ports
SHARP_PORT=5000  # TCP protocol port
HTTP_PORT=5001   # HTTP API port

# CORS - Allow specific origins or * for all
ALLOWED_ORIGINS=https://yourfrontend.com,http://localhost:3000

# Optional: JWT secret (only needed for Twoblade website integration)
JWT_SECRET=your-random-secret-here

# Optional: Cloudflare Turnstile (leave as test key or empty to disable)
PRIVATE_TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# Standalone mode
API_MODE=true
```

## 👤 Creating Users & API Keys

Connect to your database:
```bash
psql $DATABASE_URL
```

Create a user account:
```sql
-- Create user
INSERT INTO users (username, domain, password_hash, iq, is_banned)
VALUES ('myuser', 'yourdomain.com', 'password_hash_here', 100, false);

-- Generate API key (replace 1 with the user's ID)
SELECT generate_api_key(1);
```

This will return an API key like: `a1b2c3d4e5f6...` (64 characters)

Save this key securely - you'll need it for API requests.

## 🔑 API Usage

### Authentication Methods

SHARP supports two authentication methods:

1. **API Key (Recommended for external frontends)**
   - Header: `X-API-Key: your-api-key-here`
   - Endpoint: `POST /send`

2. **JWT Token (For Twoblade website)**
   - Header: `Authorization: Bearer <token>`
   - Endpoint: `POST /send/jwt`

### Send Email Example

```bash
curl -X POST http://localhost:5001/send \
  -H 'X-API-Key: your-api-key-here' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "user#yourdomain.com",
    "to": "recipient#other.com",
    "subject": "Hello from SHARP",
    "body": "This is a test email",
    "content_type": "text/plain",
    "hashcash": "1:18:250208120000:recipient#other.com::xxxx:yyyy"
  }'
```

### Hashcash (Proof of Work)

SHARP requires hashcash tokens to prevent spam:

```javascript
// Generate hashcash in JavaScript
import { createHash } from 'crypto';

function generateHashcash(resource, bits = 18) {
    const date = new Date().toISOString()
        .replace(/[-:T]/g, '').slice(2, 14);
    const rand = Math.random().toString(36).substring(7);
    
    let counter = 0;
    while (true) {
        const stamp = `1:${bits}:${date}:${resource}::${rand}:${counter}`;
        const hash = createHash('sha1').update(stamp).digest('hex');
        
        if (hasLeadingZeroBits(hash, bits)) {
            return stamp;
        }
        counter++;
    }
}

function hasLeadingZeroBits(hexHash, bits) {
    const hashInt = BigInt('0x' + hexHash);
    const shiftAmount = BigInt(160 - bits);
    return (hashInt >> shiftAmount) === 0n;
}

// Usage
const hashcash = generateHashcash('recipient#other.com', 18);
```

### Email Fields

| Field | Required | Description |
|-------|----------|-------------|
| `from` | Yes | Sender address (user#domain.com) |
| `to` | Yes | Recipient address (user#domain.com) |
| `subject` | Yes | Email subject |
| `body` | Yes | Email body (plain text or HTML) |
| `content_type` | No | `text/plain` or `text/html` (default: text/plain) |
| `html_body` | No | HTML version of email |
| `hashcash` | Yes | Proof-of-work token |
| `attachments` | No | Array of attachment objects |
| `scheduled_at` | No | ISO timestamp for scheduled sending |
| `reply_to_id` | No | ID of email being replied to |
| `thread_id` | No | Thread identifier |
| `expires_at` | No | ISO timestamp for email expiration |
| `self_destruct` | No | Boolean for self-destructing emails |

## 🌐 API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/send` | POST | API Key | Send email (recommended) |
| `/send/jwt` | POST | JWT | Send email (website integration) |
| `/server/health` | GET | None | Health check |
| `/server/info` | GET | None | API documentation & server info |

## 🔧 Managing API Keys

### Generate API key for a user:
```sql
SELECT generate_api_key(user_id);
```

### Revoke an API key:
```sql
SELECT revoke_api_key(user_id);
```

### View all API keys (admin only):
```sql
SELECT id, username, domain, api_key 
FROM users 
WHERE api_key IS NOT NULL;
```

## 🌍 DNS Configuration (Production)

Add SRV records to your DNS for SHARP server discovery:

```
_sharp._tcp.yourdomain.com. 86400 IN SRV 10 0 5000 yourdomain.com.
```

Replace:
- `yourdomain.com` with your actual domain
- `5000` with your SHARP_PORT

## 🚦 Running the Server

Start the server:
```bash
cd SHARP
bun run main.js
# or
node main.js
```

The server will listen on:
- **SHARP Protocol (TCP):** Port 5000 (configurable via SHARP_PORT)
- **HTTP API:** Port 5001 (configurable via HTTP_PORT)

## 📊 Server Info

Get detailed server information:
```bash
curl http://localhost:5001/server/info
```

Response includes:
- Protocol version
- Supported features
- API endpoints
- Hashcash requirements
- Usage examples

## 🔒 Security Considerations

1. **API Keys:** Store securely, never commit to git
2. **CORS:** Set specific origins in production, avoid `*`
3. **HTTPS:** Use reverse proxy (nginx/caddy) with SSL in production
4. **Firewall:** Restrict database access
5. **Turnstile:** Enable in production for spam prevention
6. **Rate Limiting:** Consider adding rate limits for API endpoints

## 🐳 Docker Deployment (Optional)

```dockerfile
FROM oven/bun:latest

WORKDIR /app
COPY SHARP/ .
RUN bun install

EXPOSE 5000 5001

CMD ["bun", "run", "main.js"]
```

## 🛠️ Frontend Integration

### JavaScript/TypeScript Example

```typescript
class SharpClient {
    constructor(
        private apiKey: string,
        private baseUrl: string = 'http://localhost:5001'
    ) {}

    async sendEmail(email: {
        from: string;
        to: string;
        subject: string;
        body: string;
        hashcash: string;
    }) {
        const response = await fetch(`${this.baseUrl}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            body: JSON.stringify(email)
        });

        if (!response.ok) {
            throw new Error(`Email send failed: ${response.statusText}`);
        }

        return response.json();
    }

    async getServerInfo() {
        const response = await fetch(`${this.baseUrl}/server/info`);
        return response.json();
    }
}

// Usage
const client = new SharpClient('your-api-key-here');
const hashcash = generateHashcash('recipient#other.com', 18);

await client.sendEmail({
    from: 'user#yourdomain.com',
    to: 'recipient#other.com',
    subject: 'Hello',
    body: 'Test message',
    hashcash
});
```

## 📝 Differences from Twoblade Website

When running standalone:

✅ **Enabled:**
- API key authentication
- Configurable CORS
- Optional Turnstile
- Full SHARP protocol support
- All email features (scheduling, attachments, etc.)

❌ **Not Included:**
- Web UI (use your own frontend)
- User registration endpoints
- Session management
- Redis integration
- S3 storage (configure separately if needed)

## 🐛 Troubleshooting

### Database connection fails
Check DATABASE_URL in `.env` and ensure PostgreSQL is running

### API key not working
Verify the key exists: `SELECT * FROM users WHERE api_key = 'your-key'`

### CORS errors
Add your frontend URL to ALLOWED_ORIGINS in `.env`

### Turnstile verification fails
Set to test key or empty to disable: `PRIVATE_TURNSTILE_SECRET_KEY=`

### Port already in use
Change SHARP_PORT and HTTP_PORT in `.env`

## 📚 Resources

- [Main README](../README.md) - Full Twoblade documentation
- [SHARP Protocol](./README.md) - Protocol specifications
- [Database Schema](./database/init.sql) - Database structure

## 🤝 Support

For issues and questions:
- GitHub Issues: https://github.com/twoblade/twoblade/issues
- Documentation: https://twoblade.com

---

**Note:** This standalone configuration is perfect for:
- Custom frontends (React, Vue, Angular, etc.)
- Mobile apps
- Command-line email clients
- Automated email systems
- Integration with existing applications
