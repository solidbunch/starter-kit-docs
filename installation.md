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

## 2. Getting Started

### Option A: New Project

Clone the StarterKit Foundation repository into a new directory:

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-new-project-folder
```

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

> 📁 **Tip:** We recommend using the `/srv` folder instead of `/var/www` for your web content.\
> This follows the [Filesystem Hierarchy Standard (FHS)](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s17.html), which suggests `/srv` for site-specific data served by the system.

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

Once the installation is complete, your WordPress site is running inside Docker containers and ready to use.

The site domain is defined in the `APP_DOMAIN` variable inside your active `.env.type.local` file.  
To make it work locally, you must add it to your `/etc/hosts` file:

```plaintext
127.0.0.1 myproject.local
```

> 📁 **Tip:** Domains ending with `.localhost` do **not** require manual host mapping.

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

---

## 5. Troubleshooting 🐞

If something goes wrong during installation, make sure that:

- **Docker is running**
    
    Check Docker status:
    
    ```bash
    docker info
    ```

    If Docker is not running, you'll see a connection error.

    ```text
    Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
    ```

- **Your SSH key has access to GitHub**

    Verify SSH access to GitHub:
    
    ```bash
    ssh -T git@github.com
    ```
    
    You should see a message like:
    ```text
    Hi <username>! You've successfully authenticated...
    ```  
  
    Or error like:
    
    ```text
    Permission denied (publickey).
    ```
    Or
    ```text
    fatal: Could not read from remote repository.
    ``` 


- **All required `.env.*` files are present and valid**

  Ensure files like `.env.main`, `.env.secret`, `.env.type.*` exist and are correctly filled.

    - `.env.secret` will only be generated if a valid template exists (`sh/env/.env.secret.template`)
    - If needed, delete `.env` and rerun:

      ```bash
      make install
      ```

- **Required ports are available**

  Make sure ports `80`, `443`, are not in use:

  Check ports:

  ```bash
  sudo lsof -i :80
  sudo netstat -tulpn | grep -E '80|443'
  ```

  If a port is occupied, you will see the process PID. To stop it:

  ```bash
  sudo kill <PID>
  ```

  Common error when a port is taken:

  ```text
  Error starting userland proxy: listen tcp 0.0.0.0:80: bind: address already in use
  ```

- **Check nginx logs for TLS or routing issues**

  ```bash
  make log nginx
  ```

- **Or check all docker logs**
  ```bash
  make log
  ```

---

### Full Reset

If issues persist, you can wipe everything and start clean:

```bash
make docker clean
```

It will remove all Docker containers, images, and volumes associated with this project - **excluding the database volume**, which is preserved to avoid data loss.

Then re-run the installation:

```bash
make install
```

If problems persist, open an issue and attach the full output of the `make install` command.