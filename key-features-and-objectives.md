## Key Features and Objectives

StarterKit Foundation is designed to simplify and streamline WordPress project development across all environments — from local to production.

**Core benefits and objectives of StarterKit Foundation:**

- **Quick setup.** Spin up a complete local WordPress environment with a single command. After initial configuration, `make install` builds containers, installs WordPress, dependencies, and prepares the database automatically.

- **Config-driven architecture.** All settings (app name, domains, ports, keys, etc.) are defined via `.env` files. The system uses a base config (`.env.main`), environment-specific overrides (`.env.type.local`, `.env.type.prod`, etc.), and a separate auto-generated secrets file for secure values.

- **Full-featured environment.** Includes web server, PHP/WordPress, database, and supporting services like Node.js (for asset builds), MailHog (for email testing), and phpMyAdmin (for DB access). Suitable for developers and DevOps alike.

- **Scalable to production.** Infrastructure is defined using Terraform, and server provisioning is automated via Ansible. This ensures consistent setup from development to staging and production.

- **Open source and extensible.** Licensed under MIT, the project is structured for customization and contribution. Scripts and code are modular and easy to adapt while preserving architectural integrity.
