# Migration to Prisma - Quick Start Guide

## Setup

1. **Generate Prisma Client:**
```bash
cd mailforge
npx prisma generate
npx prisma db push
```

2. **Install dependencies:**
```bash
bun install @prisma/client
```

## Usage

### Import the Prisma helper:
```javascript
import { prisma, createEmail, findUser, updateEmailStatus } from './lib/prisma.js'
```

### Key Migration Patterns

#### OLD (postgres):
```javascript
const sql = postgres(process.env.DATABASE_URL);

// Find user
const users = await sql`SELECT * FROM users WHERE username = ${username} AND domain = ${domain}`;
const user = users[0];

// Create email
const result = await sql`
    INSERT INTO emails (from_address, to_address, subject, body, status)
    VALUES (${from}, ${to}, ${subject}, ${body}, 'sent')
    RETURNING id
`;

// Update email
await sql`UPDATE emails SET status = 'sent' WHERE id = ${emailId}`;
```

#### NEW (Prisma):
```javascript
import { prisma, findUser, createEmail, updateEmailStatus } from './lib/prisma.js';

// Find user
const user = await findUser(username, domain);

// Create email
const email = await createEmail({
    from_address: from,
    from_domain: fromDomain,
    to_address: to,
    to_domain: toDomain,
    subject: subject,
    body: body,
    status: 'sent'
});

// Update email
await updateEmailStatus(emailId, 'sent');
```

## Available Helper Functions

### User Operations:
- `findUser(username, domain)` - Find user by username and domain
- `verifyUser(username, domain)` - Check if user exists
- `createUser(data)` - Create new user

### Email Operations:
- `createEmail(emailData)` - Create email record
- `updateEmailStatus(emailId, status, errorMessage)` - Update email status
- `getEmailById(id)` - Get email by ID
- `getEmailsByUser(username, domain, folder)` - Get user's emails
- `getScheduledEmails()` - Get scheduled emails ready to send

### Star Operations:
- `toggleStar(emailId, userId)` - Toggle star on email
- `getStarredEmails(userId)` - Get starred emails

### Draft Operations:
- `createDraft(userId, draftData)` - Create draft
- `updateDraft(draftId, draftData)` - Update draft
- `getDrafts(userId)` - Get user drafts
- `deleteDraft(draftId)` - Delete draft

### Contact Operations:
- `createContact(userId, contactData)` - Create contact
- `getContacts(userId)` - Get user contacts
- `deleteContact(contactId)` - Delete contact

### Hashcash Operations:
- `isHashcashUsed(token)` - Check if token was used
- `markHashcashUsed(token, expiresAt)` - Mark token as used
- `cleanupExpiredHashcash()` - Remove expired tokens

### Attachment Operations:
- `createAttachment(attachmentData)` - Create attachment record
- `updateAttachmentStatus(key, status, emailId)` - Update attachment
- `updateAttachmentsByEmailId(emailId, status)` - Update all email attachments
- `getUserStorage(userId)` - Get user's total storage usage
- `getUserStorageLimit(userId)` - Get user's storage limit

### Cleanup Operations:
- `cleanupPendingEmails()` - Mark old pending emails as failed

## Direct Prisma Access

For complex queries not covered by helpers, use `prisma` directly:

```javascript
import { prisma } from './lib/prisma.js';

const emails = await prisma.email.findMany({
    where: {
        status: 'sent',
        from_address: {
            contains: '@kosh.uno'
        }
    },
    include: {
        stars: true
    },
    orderBy: {
        sent_at: 'desc'
    },
    take: 50
});
```

## Files Already Updated:
- ✅ `/middleware/auth.js` - Using Prisma
- ✅ `/middleware/apiAuth.js` - Using Prisma  
- ✅ `/create-user.js` - Using Prisma
- ✅ `/lib/prisma.js` - Helper functions created

## Files That Need Update:
- ⏳ `/main.js` - Replace sql queries with Prisma helpers
- ⏳ `/smtp-server.js` - Replace sql queries
- ⏳ `/imap-server.js` - Replace sql queries
- ⏳ `/email-bridge.js` - Replace sql queries

## Example main.js Updates Needed:

### Verify User:
```javascript
// OLD
const users = await sql`SELECT id FROM users WHERE username = ${username} AND domain = ${domain}`;
if (!users.length) return false;

// NEW
const exists = await verifyUser(username, domain);
if (!exists) return false;
```

### Log Email:
```javascript
// OLD
const result = await sql`INSERT INTO emails (...) VALUES (...) RETURNING id`;
const emailId = result[0].id;

// NEW
const email = await createEmail({...});
const emailId = email.id;
```

### Update Email Status:
```javascript
// OLD
await sql`UPDATE emails SET status='sent' WHERE id=${emailId}`;

// NEW
await updateEmailStatus(emailId, 'sent');
```
