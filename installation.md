# Installation

> ⏱️ Start Coding in 5 Minutes

## 1. Requirements

1. [Docker Engine](https://docs.docker.com/engine/install/) v24+ (includes Compose v2)
2. [GNU Make](https://www.gnu.org/software/make/) - required to run project commands
3. [Git](https://git-scm.com/downloads) - for version control and cloning the repository

> 🖥️ **Supported Platforms:** macOS, Linux, and Windows (with [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install)) are supported. See [Platform Notes](platforms.md) for details.


## 2. Getting Started

The easiest way to begin is by **creating your own GitHub repository based on this StarterKit**:

➡️ [**Click here to generate a new project repository →**](https://github.com/solidbunch/starter-kit-foundation/generate)

> **What does this mean?**
> You’re not just running the StarterKit — you’re starting **your own WordPress project**, with your own Git history, configuration, and custom code.
> By clicking the link above, GitHub will copy this boilerplate into a new repository under your account. That becomes your clean project — ready to clone, customize, and deploy.
> This is ideal for both new builds and migrating legacy sites into a modern environment.

> ⚡️ Need a quick StarterKit exploration without creating a GitHub repo, or don’t want to use a template? See: [Advanced Installation Options](install-advanced.md)

Once your new repository is created, clone it locally:

```bash
git clone https://github.com/your-org/your-project.git
cd your-project
```

➡️ **Customize environment variables** by editing the `.env` files in the `config/environment/` folder:

- `.env.main` – shared base config, edit `APP_NAME` and `APP_TITLE`
- `.env.type.local`, `.env.type.dev`, `.env.type.stage`, `.env.type.prod` – environment-specific overrides, edit `APP_DOMAIN` variable.
- You can create as many `.env.type.*` files as needed (`.env.type.qa`, `.env.type.stage2`, etc.)

> 📁 **Tip:** We recommend using the `/srv` folder instead of `/var/www` for your web content.\
> This follows the [Filesystem Hierarchy Standard (FHS)](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s17.html), which suggests `/srv` for site-specific data served by the system.

---

## 3. Install the Stack

```bash
make install [environment_type]
```

`environment_type` if omitted, defaults to `local`, it must match a file in `config/environment/.env.type.*`

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
