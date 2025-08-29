# Composer usage

### Running Composer in Starter Kit

Composer runs in its own dedicated container. Recommended way:

```bash
# Enter the Composer container shell, then run Composer commands
make run composer
# Then inside the container:
composer install
composer update
composer require package-name
```

**Do not use other approaches:**
- Using docker compose directly (e.g. `docker compose run --rm composer composer install`) is not acceptable. It can create files with wrong ownership/permissions (UID/GID mismatch), because the process may run as a different user than expected.
- Running Composer from the host machine is acceptable but not recommended. Composer/PHP/extensions versions
  and PHP modules on the host can differ from the container, leading to inconsistent `vendor/` and
  `composer.lock` and hard‑to‑reproduce builds.

Always run Composer inside the Composer container via `make run composer` for consistent and correct file ownership and environment.

### Running Composer inside a theme or custom plugin

If your theme or custom plugin has its own `composer.json`, run Composer from that directory inside the Composer container.

```bash
# Enter the Composer container
make run composer

# Theme example
cd web/wp-content/themes/<your-theme>
composer install   # or: composer update

# Plugin example
cd web/wp-content/plugins/<your-plugin>
composer install   # or: composer update
```

Alternative (without cd), using working directory flag:
```bash
make run composer
composer install -d web/wp-content/themes/<your-theme>
composer update  -d web/wp-content/plugins/<your-plugin>
```

Note: The `composer.lock` in that directory belongs to the theme/plugin repository. Use these commands when you want to install or update dependencies only for that specific theme or plugin.

### What happens after install/update
After `composer install` or `composer update`, the post scripts defined in `composer.json` run automatically:
- Create `web/wp-core/wp-content/` if missing
- Copy configuration files from `web/wp-config/*` into `web/wp-core/`

These steps ensure WordPress core receives the required config after dependency operations.

**Container note:** Composer runs in a dedicated container separate from PHP/NGINX. See [Docker Images](docker-images.md) for Container Architecture information

## 🏗️ Project Structure & Dependencies

### Core Requirements
- **PHP**: >=8.1
- **WordPress Core**: `solidbunch/wordpress-core-no-content`
- **Kit-Modules**
- **WordPress Theme and Plugins**
- **Development Dependencies**

## 🔧 Custom Installer Configuration

### Custom Installer Paths
```json
"installer-paths": {
  "kit-modules/{$name}/": ["type:kit-module"],
  "web/wp-core/": ["type:wordpress-core"],
  "web/wp-content/mu-plugins/{$name}": ["type:wordpress-muplugin"],
  "web/wp-content/plugins/{$name}": ["type:wordpress-plugin"],
  "web/wp-content/themes/{$name}": ["type:wordpress-theme"]
}
```

**Directory Structure**:
```
web/
├── wp-core/                   # WordPress core files
├── wp-content/
│   ├── plugins/               # WordPress plugins
│   ├── themes/                # WordPress themes
│   └── mu-plugins/            # Must-use plugins
└── kit-modules/               # Custom kit modules
```

### Repository Configuration
- **WPackagist**: WordPress plugin/theme repository
- **SolidBunch WordPress Core**: Custom WordPress core package
- **Starter Kit Theme**: Development theme repository
- **Kit-Modules**: Licensed modules packages

## 🚀 Available Composer Scripts

### Environment-Specific Installation
```bash
# Development environment
composer run install-dev

# Production environment
composer run install-prod
```
Under the hood:
- install-dev → runs: `composer install`
- install-prod → runs: `composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader`

### Environment-Specific Updates
```bash
# Development environment
composer run update-dev

# Production environment
composer run update-prod
```

### Theme Management (CI/CD Only)
```bash
# Switch theme to dev-develop branch
composer run switch-theme-dev
```

**CI-only**: in DEV deploys (CI/CD) this command runs inside the Composer container to pin the theme to the `dev-develop` branch and refresh the lock. Production deployments use the default theme version from `composer.json` (`dev-master`). See `.github/workflows/job-deploy.yml` step "Switch Theme Version for Dev Environment".

### Post-Installation Scripts
```bash
# Automatically runs after install/update
composer run post-install-cmd
composer run post-update-cmd
```

## ⚙️ Configuration Settings

### Autoloader Optimization
```json
"optimize-autoloader": true
```
- Generates optimized autoloader for production
- Improves performance and reduces memory usage

### Package Installation Preferences
```json
"preferred-install": {
  "solidbunch/starter-kit-theme": "source",
  "*": "dist"
}
```
- **Source**: Custom packages installed from source code
- **Dist**: Standard packages installed from compiled distributions

### Security & Permissions
```json
"allow-plugins": {
  "composer/installers": true,
  "solidbunch/composer-installers": true
}
```
- Explicitly allows custom installer plugins
- Ensures secure package installation

## 🔄 Workflow Commands

### Initial Project Setup
```bash
# Install all dependencies (development)
composer run install-dev
# Under the hood: composer install

# Install production dependencies only
composer run install-prod
# Under the hood: composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader
```

### Adding New Packages
```bash
# Add WordPress plugin
composer require wpackagist-plugin/plugin-name

# Add WordPress theme
composer require wpackagist-theme/theme-name

# Add custom package
composer require vendor/package-name
```

### Updating Dependencies
```bash
# Update all packages
composer update

# Update specific package
composer update package-name

# Update with production optimization
composer update --no-dev --prefer-dist --optimize-autoloader
```

### Package Management
```bash
# Remove package
composer remove package-name

# Show package information
composer show package-name

# Check outdated packages
composer outdated

# Validate composer.json
composer validate
```

## 🛡️ Security & Best Practices

### Security Checks
```bash
# Check for security vulnerabilities
composer audit

# Update security advisories
composer update roave/security-advisories
```



### Lock File Management
- **Always commit** `composer.json` and `composer.lock` together
- **Never edit** `composer.lock` manually
- **Use** `composer update` to modify dependencies

## 🔍 Troubleshooting

### Common Issues
```bash
# Clear Composer cache
composer clear-cache

# Regenerate autoloader
composer dump-autoload --optimize

# Check platform requirements
composer check-platform-reqs

# Diagnose Composer issues
composer diagnose
```

### Dependency Conflicts
```bash
# Analyze dependency tree
composer why package-name

# Check why package is installed
composer why-not package-name

# Resolve conflicts interactively
composer update --interactive
```

## 📚 Useful Commands Reference

### Information Commands
```bash
composer show                   # List all packages
composer show --tree            # Show dependency tree
composer show --latest          # Show latest versions
composer status                 # Show modified packages
composer depends package-name   # Show what depends on package
```

### Maintenance Commands
```bash
composer self-update            # Update Composer itself
composer self-update --rollback # Rollback Composer update
composer config --list          # Show all configuration
composer config --global --list # Show global configuration
```

## 🚨 Important Notes

### Development vs Production
- **Development**: Includes dev dependencies and source packages
- **Production**: Only production dependencies, optimized autoloader

### Custom Packages
- `solidbunch/starter-kit-theme` is always installed from source
- Custom installers handle WordPress-specific paths

### WordPress Integration
- WordPress core is installed to `web/wp-core/`
- Plugins and themes go to standard WordPress directories
- Configuration files are automatically copied after installation

---

**Remember**: Always test dependency changes in development before deploying to production!
