# Secret Management

Secrets are generated automatically during installation using a template file:

- Template path: `sh/env/.env.secret.template`
- Variables in the template must use the placeholder `generate_this_pass`
- During installation, the `secret-gen.sh` script replaces these placeholders with randomly generated secure values
- The resulting `.env.secret` file is excluded from Git via `.gitignore`

You do **not** need to manually create `.env.secret`. It is always generated based on the template.





