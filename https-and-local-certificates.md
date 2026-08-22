# HTTPS & Local Certificates

Secure your environment with HTTPS using self-signed certificates for local development or Let’s Encrypt for production.

> 🔀 **Multi-instance mode:** everything below applies when `APP_MULTI_INSTANCE=0` (the default, single-instance NGINX setup). When `APP_MULTI_INSTANCE=1`, TLS is terminated by Traefik instead — `make ssl` just skips (production certs are issued and renewed by Traefik itself, stored in a Docker volume, no host files to manage), and `make local-cert` writes its certificate under `kit-modules/proxy/certs/local/` instead of `config/ssl/live/`. See `kit-modules/proxy/README.md`. `proxy` is a paid kit-module, not included by default — see [Infrastructure](infrastructure.md).

## Production & Staging

**1. Enable HTTPS in environment:**

Set the protocol in your production or staging environment file:

```dotenv
APP_PROTOCOL=https
```

**2. Issue TLS Certificates via Let’s Encrypt:**

Run the built-in Certbot script (requires `.env.runtime` to already exist — run `make env` first if you haven't):

```bash
make ssl
```

This will:

- Read `APP_DOMAIN` from `.env.runtime`

- Generate a temporary 1-day dummy self-signed certificate

- Start NGINX (`docker compose up -d nginx`) so it can serve the ACME challenge

- Delete the dummy certificate, then run 🔐 Certbot (`certbot certonly`) using the **webroot** authenticator configured in `config/certbot/cli.ini` (`port 80` must be reachable publicly). For an apex domain (e.g. `example.com`), the cert also covers `www.example.com`; for a subdomain (e.g. `dev.example.com`), only that exact hostname is requested.

- Save certificate files to:

  ```
  config/ssl/live/<your-domain>/fullchain.pem
  config/ssl/live/<your-domain>/privkey.pem
  ```

- Restart NGINX with HTTPS enabled

> ℹ️ If the certificate already exists, the script skips renewal.
> ⚠️ Ensure `port 80` is open and not blocked by a firewall or ISP.

**3. Manual Certificates (optional):**

   You may manually place your certificates at:

   ```
   config/ssl/live/<your-domain>/fullchain.pem
   config/ssl/live/<your-domain>/privkey.pem
   ```

---

## Local Development

Let’s Encrypt does **not** issue certificates for local domains like `.localhost`. Use self-signed certificates instead.

### Option 1: mkcert (recommended)

The one-command path is `make local-cert`, which generates and installs a locally-trusted (mkcert) certificate for you. Prerequisite: [`mkcert`](https://github.com/FiloSottile/mkcert) must be on your host `PATH`, with `mkcert -install` run once beforehand (the script does not install `mkcert` itself). The command is idempotent — it skips regeneration if a valid certificate already exists; pass `make local-cert force` to regenerate anyway.

```bash
mkcert -install
make local-cert
```

If you prefer to run `mkcert` manually (or need to see what `make local-cert` does under the hood), install [`mkcert`](https://github.com/FiloSottile/mkcert) and run:

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
config/ssl/live/myproject.localhost/fullchain.pem
config/ssl/live/myproject.localhost/privkey.pem
```

Then update your local environment type file at `config/environment/.env.type.local`, or create an override file at  
`config/environment/.env.type.local.override`.

> ➡️ See [Environment Configuration and Secret Management](environment-and-secrets.md) for details.

```dotenv
APP_PROTOCOL=https
```

Start your environment:

```bash
make up
```

> 📌 Local HTTPS support assumes your domain matches the certificate. Adjust your `/etc/hosts` accordingly.

### Option 2: Manual Self-Signed Certificates

Generate self-signed certificates using OpenSSL:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout config/ssl/live/myproject.localhost/privkey.pem \
  -out config/ssl/live/myproject.localhost/fullchain.pem \
  -subj "/CN=myproject.localhost"
```

This creates a self-signed certificate valid for 365 days.

> ⚠️ Self-signed certificates will trigger browser warnings. You can bypass them for local development.
> To avoid warnings, you can add the self-signed certificate to your system's trusted certificates store.
> 
> See [Letsencrypt Documentation](https://letsencrypt.org/docs/certificates-for-localhost/) for more details on using self-signed certificates locally.
>

---

## ↻ Switching to HTTPS and redirects

The NGINX setup supports both HTTP and HTTPS, with automatic redirection configured via:

* `config/nginx/config/http.conf.template` — used when `APP_PROTOCOL=http`
* `config/nginx/config/https.conf.template` — used when `APP_PROTOCOL=https`

Redirection behavior:

* HTTP → HTTPS
* `www.domain` → `domain`

> Configuration is automatically templated and mounted at container start. No manual edits are required in `*.conf` files.
