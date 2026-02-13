# MailForge - Full-Featured Email System

[License](LICENSE)

A complete, self-hosted email server supporting standard email protocols and traditional email compatibility.

## Features

- **Standard email format**: Traditional `user@domain.com` addressing
- **Full SMTP/IMAP support**: Works with Outlook, Thunderbird, Gmail app, etc.
- **Direct email sending**: Sends directly to recipient mail servers (no relay needed)
- **Receive from anywhere**: Accept emails from Gmail, Yahoo, and all traditional email services
- Self-hosted and fully independent
- Theme-aware HTML emails with reactive styling
- PostgreSQL database with pgvector support
- Docker deployment ready

## Protocol Ports

- **5000**: Mail Protocol (server-to-server)
- **5001**: HTTP API
- **587**: SMTP (for email clients like Outlook)
- **143**: IMAP (for email clients to receive)
- **2525**: SMTP Bridge (receives emails from external mail servers like Gmail)

## Email Features

*   Uses standard email addresses in the format `user@domain.com`.
*   `user` is the username of the recipient.
*   `domain.com` is the domain name of the mail server.

HTML emails support theme-aware reactive styling:
```html
<!-- Theme-aware styling -->
<div style="background: {$LIGHT ? '#ffffff' : '#1a1a1a'}">
<p style="color: {$DARK ? '#ffffff' : '#000000'}">Content</p>

<!-- Complex conditional styling -->
<div style="
  background: {$DARK ? '#2d2d2d' : '#f0f0f0'};
  border: {$DARK ? '1px solid #404040' : '1px solid #ddd'};
  box-shadow: {$DARK ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.1)'};
">

<!-- Available operators: $DARK, $LIGHT -->
```

## Running the MailForge Server

1.  **Navigate to the `mailforge` directory:**
    ```bash
    cd mailforge
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

3.  **Run the initialization script:**
    ```bash
    bash database/init.sh
    ```

4.  **Set up environment variables:**

    *   The `init.sh` script will create a `.env` file in the `SHARP` directory.
    *   It will prompt you for your domain name and set up the basic `.env` file.
    *   You may need to modify the `.env` file to match your actual configuration, especially the `DATABASE_URL`.
        ```
        DATABASE_URL=postgres://user:password@host:port/database
        SHARP_PORT=5000
        HTTP_PORT=5001
        DOMAIN_NAME=yourdomain.com
        ```

5.  **Run the server:**
    ```bash
    cd ..
    bun run .
    ```

6.  **Add DNS records for your domain (e.g., kosh.uno):**

    **MX Record (Required for receiving emails):**
    ```
    kosh.uno. 3600 IN MX 10 mail.kosh.uno.
    ```

    **A Record (Points to your server):**
    ```
    mail.kosh.uno. 3600 IN A YOUR_SERVER_IP
    ```

    **SPF Record (Helps prevent spam classification):**
    ```
    kosh.uno. 3600 IN TXT "v=spf1 mx ~all"
    ```

    **DKIM Record (Optional but recommended):**
    ```
    See DKIM setup section below
    ```

## How It Works

**Sending emails:**
- Your server looks up MX records for the recipient's domain
- Connects directly to their mail server on port 25
- Delivers the email server-to-server (just like Gmail does)
- No relay or third-party SMTP credentials needed!

**Receiving emails:**
- External mail servers look up your MX records
- They connect to your server on port 2525
- Your server accepts and stores the email
- Users can read via IMAP (port 143) or webmail

## Using Traditional Email Clients

Your mail server works with any standard email client:

**SMTP (Sending):**
- Server: `mail.kosh.uno` (or your domain)
- Port: `587`
- Username: `username@kosh.uno`
- Password: Your password or API key
- Security: None/STARTTLS (optional)

**IMAP (Receiving):**
- Server: `mail.kosh.uno`
- Port: `143`
- Username: `username@kosh.uno`
- Password: Your password or API key

**Supported clients:**
- Outlook
- Thunderbird
- Apple Mail
- Gmail app (Android/iOS)
- Any standard email client

**Examples:**

**Send to anyone:**
- To Gmail: `someone@gmail.com`
- To Yahoo: `friend@yahoo.com`
- To your server: `alice@kosh.uno`

**Receive from anywhere:**
- Gmail users send to: `yourname@kosh.uno`
- Yahoo users send to: `yourname@kosh.uno`
- Anyone with email can reach you!

## Running with Docker

1.  **Start the SHARP server and database:**
    ```bash
    docker compose up -d
    ```

2.  **Check status:**
    ```bash
    docker compose ps
    ```

## Running the Database Standalone

1.  **Change the default database password:** (optional)
    *   Open the `docker-compose.yml` file and change `REPLACE_ME` to something else.
        ```yaml
        version: '3.8'

        services:
          postgres_db:
            # ...
            environment:
              POSTGRES_USER: postgres
              POSTGRES_PASSWORD: REPLACE_ME  # Replace with your desired password
            # ...
        ```
    *   Update your `.env` file with the new password.

2.  **Start the database:**
    ```bash
    docker compose up -d postgres
## Features

- Decentralized email protocol using `#` addressing
- Self-hosted server capability
- Theme-aware HTML emails with reactive styling
- PostgreSQL database with pgvector support
- Docker deployment ready
