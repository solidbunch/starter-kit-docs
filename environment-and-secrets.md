# Environment and Secrets

### Environment Configuration

Configuration is layered and environment-specific:
- `config/environment/.env.main` — base configuration shared across environments
- `config/environment/.env.type.local`, `.dev`, `.prod`, etc. — environment overrides
- `config/environment/.env.type.local.override`, `*.dev.override`, etc. — optional overrides for local, dev, etc. (not committed to Git)
- `config/environment/.env.secret` — sensitive credentials (auto-generated during install, not committed to Git)

`make env` (via `sh/env/init.sh`) merges the non-secret files above (main → type → override) into
`.env.runtime` at the repo root. `.env.runtime` is what every service actually reads at runtime —
each service in `docker-compose.yml`/`docker-compose.toolkit.yml` loads it via `env_file:` — and
several scripts (`sh/system/local-cert.sh`, `sh/system/certbot.sh`, `sh/system/db-tunnel.sh`,
`sh/system/validate-nginx.sh`) hard-require it to exist, erroring with "Run `make env` first" if
it's missing. `.env` is then merged on top by adding `.env.secret`, and is used by `docker compose`
itself for `${VAR}` interpolation inside each service's `environment:` block. Both `.env` and
`.env.runtime` are generated files, excluded from Git via `.gitignore`.

> ⚠️ **Tip:** Do not edit `.env` or `.env.runtime` directly — they're regenerated on every `make
> env`/`make install`. Instead, modify the appropriate `.env.type.*` files or create an override
> file for local development.

### Secret Management

Secrets are generated automatically during installation using a template file:

- Template path: `sh/env/.env.secret.template`
- The template uses two placeholders: `generate_this_pass` for passwords (e.g. `MYSQL_ROOT_PASSWORD=generate_this_pass`) and `generate_key` for WordPress authentication keys/salts (e.g. `WP_AUTH_KEY='generate_key'`). The generator script also supports a third placeholder, `generate_safe_token`, which the shipped template does not currently use.
- During installation, `secret-gen.sh` runs `pass_gen.sh` (in a disposable container), which replaces these placeholders with randomly generated secure values
- The resulting `.env.secret` file is excluded from Git via `.gitignore`

You do **not** need to manually create `.env.secret`. It is always generated based on the template.

SSL certificates located in `config/ssl/live/<your-domain>/` are also managed as secrets. They should not be committed to version control. 

> 🔐 **Important:** Do not commit `.env.secret`, SSL files and other sensitive data to version control. They are meant to be environment-specific and should be kept secure.

