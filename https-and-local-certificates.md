# HTTPS & Local Certificates

Secure your environment with HTTPS using self-signed certificates for local development or Let’s Encrypt for production.

### 🔐 Production & Staging

1. **Enable HTTPS in environment:**

   Set the protocol in your production or staging environment file:

   ```dotenv
   APP_PROTOCOL=https
   ```

2. **Issue TLS Certificates via Let’s Encrypt:**

   Run the built-in Certbot script:

   ```bash
   make ssl
   ```

   This will:

    * Read `APP_DOMAIN` from `.env`

    * Temporarily stop NGINX

    * Run Certbot in standalone mode (`port 80` must be open publicly)

    * Save certificate files to:

      ```
      config/ssl/live/<your-domain>/fullchain.pem
      config/ssl/live/<your-domain>/privkey.pem
      ```

    * Restart NGINX with HTTPS enabled

   > ℹ️ If the certificate already exists, the script skips renewal.
   > ⚠️ Ensure `port 80` is open and not blocked by a firewall or ISP.

3. **Manual Certificates (optional):**

   You may manually place your certificates at:

   ```
   config/ssl/live/<your-domain>/fullchain.pem
   config/ssl/live/<your-domain>/privkey.pem
   ```

---

### 🧪 Local Development

Let’s Encrypt does **not** issue certificates for local domains like `.localhost`. Use self-signed certificates instead.

#### Option 1: mkcert (recommended)

Install [`mkcert`](https://github.com/FiloSottile/mkcert) and run:

```bash
mkcert -install
mkcert myproject.localhost
```

This creates two files, e.g.:

```
myproject.localhost.pem
myproject.localhost-key.pem
```

Rename and copy them to:

```
config/nginx/ssl/myproject.localhost/fullchain.pem
config/nginx/ssl/myproject.localhost/privkey.pem
```

Then update your local `.env`:

```dotenv
APP_PROTOCOL=https
```

Start your environment:

```bash
make up
```

> 📌 Local HTTPS support assumes your domain matches the certificate. Adjust your `/etc/hosts` accordingly.

---

### ↻ Switching to HTTPS

The NGINX setup supports both HTTP and HTTPS, with automatic redirection configured via:

* `config/nginx/config/http.conf.template` — used when `APP_PROTOCOL=http`
* `config/nginx/config/https.conf.template` — used when `APP_PROTOCOL=https`

Redirection behavior:

* HTTP → HTTPS
* `www.domain` → `domain`

> Configuration is automatically templated and mounted at container start. No manual edits are required in `*.conf` files.
