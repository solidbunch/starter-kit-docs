# Installation

There are two setup phases: initializing a new project and installing an existing one.

- For new projects, clone the repository and configure your environment files.
- For existing ones, just clone your project and run the installation.

Both workflows use the same simple process - `make install` builds containers, installs dependencies, generates secrets, and bootstraps a ready-to-use WordPress stack.

## 1. Requirements

1. [Docker Engine](https://docs.docker.com/engine/install/) v24+
2. [Docker Compose](https://docs.docker.com/compose/install/) v2.21+
3. [GNU Make](https://www.gnu.org/software/make/) - required to run project commands
3. **Git**, [GitHub SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) or [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Check your GitHub SSH access with command
```
ssh -T git@github.com
```

## 2. Getting Started

### Option A: New Project

Clone the StarterKit Foundation repository into a new directory:

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-new-project-folder
```

> 📁 **Tip:** We recommend using the `/srv` folder instead of `/var/www` for your web content.\
> This follows the [Filesystem Hierarchy Standard (FHS)](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s17.html), which suggests `/srv` for site-specific data served by the system.

Customize your environment files in `config/environment/` folder:

- `.env.main` – shared base config, edit `APP_NAME` and `APP_TITLE`
- `.env.type.local`, `.env.type.dev`, `.env.type.stage`, `.env.type.prod` – environment-specific overrides, edit `APP_DOMAIN` variable.
- You can create as many `.env.type.*` files as needed (`.env.type.qa`, `.env.type.stage2`, etc.)
- Then initialize a new Git repository and push your changes:

```bash
git remote set-url origin git@github.com:<your-org>/<your-project>.git
git push -u origin main
```

### Option B: Existing Project

```bash
git clone git@github.com:<your-org>/<your-project>.git your-project
```

---

## 3. Install the Stack

```bash
make install [environment_type]
```

- `environment_type` if omitted, defaults to `local`
- `environment_type` must match a file in `config/environment/.env.type.*`

### What happens during installation

1. If `.env.secret` is missing, it is generated from a template
2. `.env.main`, `.env.type.[environment_type]`, and `.env.secret` are merged into root folder `.env` file
3. Docker containers are pulled and started
4. Composer dependencies are installed (PHP)
5. npm dependencies are installed (Node)
6. Frontend assets are compiled via `npm run dev|prod`
7. The database is initialized using WP-CLI
8. WordPress is installed and configured
9. An admin user is created and the default theme is activated

You can safely re-run `make install` at any time - it is **idempotent**.

### Examples

✅ Install locally (most common scenario):

```bash
make install
```

This will use `config/environment/.env.type.local`.

Install using the production environment:

```bash
make install prod
```

This will use `config/environment/.env.type.prod`, applying values like `APP_DOMAIN`, `APP_PROTOCOL`, etc.

---

## 4. Post-Installation

To access the site:

- Use the domain set in your `.env.type.local`
- For `.localhost` domains: no manual setup required
- For `.local` domains, map it in your hosts file:

```plaintext
127.0.0.1   myproject.local
```

---

## 5. Optional: HTTPS

For staging/production mode:

- Place certificates in `config/nginx/ssl/`
- Set `APP_PROTOCOL=https` in your `.env.type.prod`

More info: [Deployment and CI/CD](../12-deployment-and-cicd.md)

---

## 6. Next Steps

- Enable GitHub Actions via `.github/workflows/*.yml`
- Use Terraform/Ansible from the `iac/` folder
- Extend the theme: `web/wp-content/themes/starter-kit-theme/`
- Harden production:
   - Set `APP_DEBUG=0`
   - Disable xDebug
   - Tune `OPCACHE_*` in `config/php/*.ini`

---

## 7. Troubleshooting

- Make sure Docker is running
- Review terminal output for any errors
- Double-check all `.env.*` files for completeness
- `.env.secret` requires a valid template to generate
- You can delete `.env` and `.env.secret` and re-run `make install`

---

### Common Issues

- `make log nginx` reveals most TLS/routing problems
- Ensure ports `80`, `443`, `3306`, `9003` are not occupied
- For a clean slate:

```bash
make docker clean
make install
```

Still stuck? Open an issue and attach your full install log.



















#### Secret Management

Secrets are generated automatically during installation using a template file:

- Template path: `sh/env/.env.secret.template`
- Variables in the template must use the placeholder `generate_this_pass`
- During installation, the `secret-gen.sh` script replaces these placeholders with randomly generated secure values
- The resulting `.env.secret` file is excluded from Git via `.gitignore`

You do **not** need to manually create `.env.secret`. It is always generated based on the template.





### 3. Post-Installation Access

To access the site locally, ensure the domain used in `.env.type.local` resolves correctly.

If you're using a `.local` domain:

```plaintext
127.0.0.1   myproject.local
```

Domains ending in `.localhost` are resolved automatically and require no manual setup.

After installation, your WordPress site will be available at the specified domain (e.g. `http://myproject.localhost`).

---

### 4. Optional Configuration: HTTPS

For production or staging environments, you may want to enable HTTPS:

- Place your TLS certificates in `config/nginx/ssl/`
- Update `.env.type.prod` with `APP_PROTOCOL=https`

More details are available in the [Deployment and CI/CD](../12-deployment-and-cicd.md) section.

---

For using [PAT](#cicd-deployments) in run make secret, and add `COMPOSER_AUTH` to `.env.secret` 

9. Next steps
   Set up GitHub Actions — review .github/workflows/*.yml for CI/CD examples.

Configure IaC — terraform / ansible samples live in iac/.

Extend the theme — the bundled starter theme resides in web/wp-content/themes/starter-kit-theme/.

Harden production — tighten APP_DEBUG, disable xDebug, tune OPCACHE_* env vars.


### 5. Troubleshooting 🐞

- Ensure Docker is running before executing `make install`
- If the command fails, review the terminal logs for errors
- Double-check the validity and completeness of all `.env.*` files
- `.env.secret` will not be generated if the template file is missing
- You can safely delete `.env`, `.env.secret`, and rerun the install


Having trouble?
make log nginx often reveals TLS or routing issues.

Verify that ports 80/443/3306/9003 are free on your host.

Delete everything (docker system prune -af) and re-run make install.

If you still get stuck, open an issue and include your full make install output.
