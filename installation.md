# Installation

## 1. Requirements

1. [Docker Engine](https://docs.docker.com/engine/install/) v24+
2. [Docker Compose](https://docs.docker.com/compose/install/) v2.21+
3. [GNU Make](https://www.gnu.org/software/make/) - required to run project commands
3. [Git](https://git-scm.com/downloads), [GitHub SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) or [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

## 2. Getting Started

Clone this repository into a new directory:

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-new-project-folder
```

Customize environment variables by editing the `.env` files in the `config/environment/` folder:

- `.env.main` – shared base config, edit `APP_NAME` and `APP_TITLE`
- `.env.type.local`, `.env.type.dev`, `.env.type.stage`, `.env.type.prod` – environment-specific overrides, edit `APP_DOMAIN` variable.
- You can create as many `.env.type.*` files as needed (`.env.type.qa`, `.env.type.stage2`, etc.)
- Then initialize a new Git repository for your project and push changes (optional)

> 📁 **Tip:** We recommend using the `/srv` folder instead of `/var/www` for your web content.\
> This follows the [Filesystem Hierarchy Standard (FHS)](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s17.html), which suggests `/srv` for site-specific data served by the system.

---

## 3. Install the Stack

```bash
make install [environment_type]
```

- `environment_type` if omitted, defaults to `local`, it must match a file in `config/environment/.env.type.*`

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

> ♻️ **Note** You can safely re-run `make install` at any time - it is **idempotent**.

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

✅ Once the installation is complete, your WordPress site is running inside Docker containers and ready to use.

The site domain is defined in the `APP_DOMAIN` variable inside your active `.env.type.local` file.  
To make it work locally, you must add it to your `/etc/hosts` file:

```plaintext
127.0.0.1 myproject.local
```

> 💡 **Tip:** Domains ending with `.localhost` do **not** require manual host mapping.

To open the site in your browser:

```
http://myproject.local
```

Or access the admin panel directly:

```
http://myproject.local/wp-admin
```

Login credentials are printed in the terminal during `make install`, and also stored in `config/environment/.env.secret`:

```dotenv
WP_ADMIN_USER=admin
WP_ADMIN_PASSWORD=...
```

Now you can start developing your theme and plugins, or customize the WordPress installation as needed.

> 🔐 **Security Note:** The `.env.secret` file contains sensitive credentials and should not be committed to version control. It is generated automatically during installation and should be kept secure.
> 
> 🛠️ **Tip:** If you have any problems during installation, check the The [Troubleshooting](troubleshooting.md) section for common issues and solutions.
