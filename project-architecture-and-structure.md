## Project Architecture and Structure

StarterKit Foundation is composed of two core layers: the environment (containers, configuration files, and scripts) and the WordPress application (core, content, and theme). The architecture is structured for modularity, scalability, and predictability across local, staging, and production workflows.

```plaintext
├── backups/                  # Database and media backups
├── config/                   # Environment, nginx, and PHP configuration
│   ├── environment/          # .env files for local, dev, stage, prod
│   ├── nginx/                # Nginx configuration templates
│   └── php/                  # PHP .ini configuration per environment
├── db-data/                  # Persistent database volume
├── dockerfiles/              # Custom Dockerfile definitions
├── iac/                      # Infrastructure as Code (Terraform + Ansible)
├── logs/                     # Log files for WordPress, PHP, nginx
├── sh/                       # Shell scripts: setup, CLI wrappers, backups
├── web/                      # WordPress application root
│   ├── wp-config/            # WordPress config (e.g. wp-config.php)
│   ├── wp-content/           # Themes, plugins, uploads
│   │   ├── mu-plugins/       # Must-use plugins (auto-loaded)
│   │   ├── plugins/          # Composer or manually installed plugins
│   │   ├── themes/           # Includes the custom starter-kit theme
│   │   └── uploads/          # User-uploaded media (excluded from VCS)
│   └── wp-core/              # WordPress core (managed by Composer)
├── composer.json             # PHP and WordPress dependencies
├── docker-compose.yml        # Main Docker Compose file
├── docker-compose.build.yml  # Additional services (Node.js, MailHog, etc.)
├── Makefile                  # Developer-friendly command aliases
└── README.md                 # Project documentation
```

### Environment Configuration

Configuration is layered and environment-specific:
- `config/environment/.env.main` — base configuration shared across environments  
- `config/environment/.env.type.local`, `.dev`, `.prod`, etc. — environment overrides  
- `config/environment/.env.secret` — sensitive credentials (auto-generated during install)

These are merged into a unified `.env` file at runtime using `make` scripts.

### Docker Services

The project defines multiple containers to cover all development and runtime needs:

- **php** – PHP-FPM container with WP-CLI and Xdebug  
- **nginx** – Web server container using templated configs  
- **mariadb** – MariaDB database service  
- **composer** – Composer service for managing PHP/WordPress dependencies  
- **node** – Node.js container for building front-end assets  
- **mailhog** – Optional SMTP server for testing outgoing email  
- **pma** – Optional phpMyAdmin interface for local DB access

These services ensure developers and DevOps engineers have all the tools needed to work efficiently across environments.

### WordPress Application

WordPress is installed using Composer, with the following layout:
- `wp-core/` contains the WordPress core files
- `wp-config/` includes the project's configuration files
- `wp-content/` houses themes, plugins, and uploads

This separation allows for:
- isolated configuration management  
- centralized dependency control  
- consistent behavior from local to production setups
