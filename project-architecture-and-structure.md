## Project Architecture and Structure

StarterKit Foundation is composed of two core layers: the environment (containers, configuration files, and scripts) and the WordPress application (core, content, and theme). The architecture is structured for modularity, scalability, and predictability across local, staging, and production workflows.

```plaintext
├── backups/                  # Daily and weekly WordPress media, and database backups
├── config/                   # Global config files
│   ├── certbot/              # Let's Encrypt configuration for SSL certificates
│   ├── cron/                 # Cron jobs for scheduled tasks
│   ├── environment/          # Environment configuration files
│   ├── nginx/                # Nginx configuration templates
│   ├── php/                  # PHP .ini configuration per environment
│   └── ssl/                  # SSL certificates and keys
├── db-data/                  # Persistent database volume
├── dockerfiles/              # Custom Dockerfile definitions
├── iac/                      # Infrastructure as Code (Terraform + Ansible)
├── logs/                     # Log files for WordPress, PHP, nginx
├── sh/                       # Shell scripts: setup, CLI wrappers, backups
├── web/                      # Web application folder
│   ├── wp-config/            # WordPress config (e.g. wp-config.php) & files that should be copied to web root dir
│   ├── wp-content/           # Themes, plugins, uploads
│   │   ├── mu-plugins/       # Must-use plugins (auto-loaded)
│   │   ├── plugins/          # Composer or manually installed plugins
│   │   ├── themes/           # Themes folder. Add your theme here
│   │   └── uploads/          # User-uploaded media (excluded from VCS)
│   └── wp-core/              # WordPress core (managed by Composer)
├── .editorconfig             # Editor configuration for consistent coding style
├── composer.json             # PHP and WordPress dependencies
├── docker-compose.yml        # Main Docker Compose file
├── docker-compose.build.yml  # Additional services (Node.js, MailHog, etc.)
└── Makefile                  # Developer-friendly command aliases
```

### Docker Services

The project defines multiple containers to cover all development and runtime needs:

**Main Docker Compose file** (`docker-compose.yml`):
- **mariadb** – MariaDB database service
- **php** – PHP-FPM container with WP-CLI and Xdebug  
- **nginx** – Web server container using templated configs
- **cron** – Cron service for scheduled tasks

**Additional services** (`docker-compose.build.yml`):
- **composer** – Composer service for managing PHP/WordPress dependencies  
- **node** – Node.js container for building front-end assets 
- **phpmyadmin** – Optional phpMyAdmin interface for local DB access
- **certbot** – Let's Encrypt container for SSL certificate management
- **mailhog** – Optional SMTP server for testing outgoing email

These services ensure developers and DevOps engineers have all the tools needed to work efficiently across environments.

### WordPress Application

WordPress is installed using Composer, with the following layout:
- `wp-core/` contains the WordPress core files
- `wp-config/` includes the project's configuration files
- `wp-content/` houses themes, plugins, and uploads

This separation allows for:
- isolated configuration management  
- centralized dependency control  
- absolute consistent behavior from local to production setups
