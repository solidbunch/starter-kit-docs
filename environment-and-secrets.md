# Environment and Secrets

### Environment Configuration

Configuration is layered and environment-specific:
- `config/environment/.env.main` — base configuration shared across environments
- `config/environment/.env.type.local`, `.dev`, `.prod`, etc. — environment overrides
- `config/environment/.env.type.local.override`, `*.dev.override`, etc. — optional overrides for local, dev, etc. (not committed to Git)
- `config/environment/.env.secret` — sensitive credentials (auto-generated during install, not committed to Git)

These are merged into a unified `.env` file at runtime using `make` scripts.

> ⚠️ **Tip:** Do not edit the `.env` file directly. Instead, modify the appropriate `.env.type.*` files or create an override file for local development.

### Secret Management

Secrets are generated automatically during installation using a template file:

- Template path: `sh/env/.env.secret.template`
- Variables in the template must use the placeholder `generate_this_pass`
- During installation, the `secret-gen.sh` script replaces these placeholders with randomly generated secure values
- The resulting `.env.secret` file is excluded from Git via `.gitignore`

You do **not** need to manually create `.env.secret`. It is always generated based on the template.

SSL certificates located in `config/ssl/live/<your-domain>/` are also managed as secrets. They should not be committed to version control. 

> 🔐 **Important:** Do not commit `.env.secret`, SSL files and other sensitive data to version control. They are meant to be environment-specific and should be kept secure.

