## Installation and Environment Setup

StarterKit Foundation uses Docker to automate local development and environment provisioning. The setup process is designed to be minimal, repeatable, and consistent across all stages.

### Prerequisites

Make sure the following tools are installed on your machine:

- **Docker Engine** v24+ and **Docker Compose** v2.21+  
- **Git**  
- *(Optional)* **Node.js** and **Composer** on host — not required, as they run inside containers  

### 1. Clone the Project

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-project
cd my-project
```

### 2. Configure Environments

Edit the environment files under `config/environment/`:

- `.env.main` — global configuration (domain, database, app name, etc.)  
- `.env.type.local`, `.env.type.dev`, `.env.type.prod` — overrides for each environment type  
- `.env.secret` — generated automatically to store sensitive values like DB passwords and WordPress salts  

You don’t need to create `.env.secret` manually — it will be generated on install.

### 3. Run Installation

```bash
make install
```

This command:

- Merges `.env.main` + environment-specific file + `.env.secret` into a root `.env`
- Generates strong passwords and secrets
- Installs WordPress via Composer
- Builds assets via Node.js container
- Initializes the database using WP-CLI
- Activates the default theme and sets up configuration files

> Use `make install prod` or `make install stage` to target other environments.

### 4. Add Hosts Entry

To access the site locally, map the domain in your hosts file:

```plaintext
127.0.0.1   myproject.local
```

Then open `http://myproject.local` in your browser.

---

After installation, your WordPress site will be ready with a fully functional theme and toolchain.
