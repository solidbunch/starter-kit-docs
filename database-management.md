# Database management

### Upgrading MariaDB major version

`APP_DATABASE_IMAGE` in `config/environment/.env.main` is pinned to a specific MariaDB tag (for
example `11.8.9-noble`). Updating this tag to a **new major version** (e.g. `11.5` → `11.8`) is
not automatic for an environment with existing data — the official MariaDB image does not run
its internal `mariadb-upgrade` step on an existing data volume unless told to.

**How you'll notice an upgrade is needed — just check `docker ps`.** The official image's own
healthcheck only detects an upgrade *currently in progress*, not one that was skipped and never
ran — on its own, `docker ps` can show the `mariadb` container as `healthy` even while it's
quietly running on stale, pre-upgrade system tables. This is a known gap in the upstream image
itself, not specific to this project — see the `mariadb` service's `healthcheck:` block in
`docker-compose.yml` for the extra check this project adds on top of the official script
specifically to close that gap: it compares the running server's version against the version
`mariadb-upgrade` last recorded, and fails the healthcheck on a mismatch.

So after crossing a MariaDB major version, just look at the container status:

```bash
docker ps
```

If `mariadb` shows **`unhealthy`** instead of `healthy`, an upgrade is needed — don't treat the
deploy as done. For the full picture (or on an older checkout without this healthcheck addition),
you can still check the startup log directly:

```bash
make log mariadb
```

Look for this exact line:

```
MariaDB upgrade (mariadb-upgrade or creating healthcheck users) required, but skipped due to $MARIADB_AUTO_UPGRADE setting
```

**Option 1 — automatic (recommended for a single standalone instance, which is this project's
default topology):**

1. In `.env.secret`, uncomment and set:
   ```
   MARIADB_AUTO_UPGRADE=1
   ```
2. `make recreate <env>` — the container runs `mariadb-upgrade` itself on start (with its own
   pre-upgrade backup of the system `mysql` database, written into the data directory).
3. Once it's confirmed healthy (`make log mariadb` shows normal startup, `docker ps` shows
   `healthy`), comment `MARIADB_AUTO_UPGRADE` back out — it should not stay on for routine
   restarts.

**Option 2 — manual (official MariaDB-recommended procedure, preferred for a replicated/Galera
topology or anywhere you want to run the step under supervision):**

1. Back up first — `make export` (or a manual `mariadb-dump`), plus a copy of `./db-data`.
2. Recreate the container on the new image tag (`make recreate <env>`); it may fail to become
   healthy until the upgrade runs — that's expected.
3. Run the upgrade inside the container:
   ```bash
   make exec mariadb mariadb-upgrade -u root -p
   ```
4. Restart: `make restart <env>`.

`mariadb-upgrade` is safe to run more than once — re-running it is a no-op if nothing needs
upgrading. See MariaDB's own
[Upgrading Between Major MariaDB Versions](https://mariadb.com/kb/en/upgrading-between-major-mariadb-versions/)
guide for the full official procedure.

#### Collation drift after a MariaDB version bump (optional)

A MariaDB major-version bump can also change the server's **default collation** (the rule it uses
to compare/sort text) for any new table created without one explicitly set. WordPress's
`DB_COLLATE` in `wp-config.php` (driven by `WP_DB_COLLATE` in `.env.secret`) is empty by default,
so WordPress falls back to whatever the server picks — which means tables created before the
version bump and tables created after it can end up on two different collations.

This is **optional, not required** — your site keeps working either way. Pin a collation only if
you want to eliminate the drift. Pinning `WP_DB_COLLATE` by itself is not enough: existing tables
keep whatever collation they already have, so you also need to convert them, or you'll get
`Illegal mix of collations` errors on queries that join an old-collation table with a new one.

**1. Check what your existing tables are actually using:**

```bash
make exec mariadb mariadb -u root -p -e "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();"
```

**2. Decide: keep the existing collation (no drift, no new features) or move to the server's new
default (future-proof, but needs every table converted).** Check what the server's new default
actually is:

```bash
make exec mariadb mariadb -u root -p -e "SHOW VARIABLES LIKE 'collation_server';"
```

**3. If you choose to convert, back up first (`make export`), then convert the database default
and every existing table** — replace `your_collation` with the value from step 1 or 2:

```bash
make exec mariadb mariadb -u root -p -e "ALTER DATABASE wordpress CHARACTER SET utf8mb4 COLLATE your_collation;"
```

Generate and run one `ALTER TABLE` per table (this avoids hand-typing 30+ table names):

```bash
make exec mariadb mariadb -u root -p -N -e "SELECT CONCAT('ALTER TABLE \`', TABLE_NAME, '\` CONVERT TO CHARACTER SET utf8mb4 COLLATE your_collation;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();" wordpress > /tmp/collation_convert.sql
make exec mariadb mariadb -u root -p wordpress < /tmp/collation_convert.sql
```

This locks each table briefly while it rewrites it — on a large table this can take a while and
should be tested on staging first, not run directly against a live production table set.

**4. Set `WP_DB_COLLATE` in `.env.secret` to the same value**, then `make env <env>` and
`make recreate <env>` so WordPress creates any future table with the same collation.

**5. Verify the site still works** — open the homepage and wp-admin, check
`logs/wordpress/debug.log` for new errors.

### Local database tunnel
The `mariadb` service never publishes a host port directly (in either single- or multi-instance mode), so the database is not reachable from the host by default. To connect from an external app (for example [MySQL Workbench](https://www.mysql.com/products/workbench/), [HeidiSQL](https://www.heidisql.com/) or [PHPStorm](https://www.jetbrains.com/help/phpstorm/configuring-ssh-and-ssl.html)), use `make db-tunnel` to spin up an ephemeral `socat` sidecar container on the compose network that forwards `127.0.0.1:<port>` to the `mariadb` container's `3306`.

`make up` must have been run first - the tunnel script errors if the database container isn't running.

1. Start the tunnel:

```bash
make db-tunnel start
```

The default port is `3306`. To use a different port:

```bash
make db-tunnel start 3307
```

2. Check tunnel status:

```bash
make db-tunnel status
```

3. Open your database management app and connect to `127.0.0.1:<port>`

4. Stop the tunnel when done:

```bash
make db-tunnel stop
```


### phpMyadmin options
To use phpMyadmin need to run the phpMyadmin container first. It's not running by default.

1. Edit the `.env.main` file, find `PMA_EXT_PORT` - make sure that the port is unique. If you are using multiple instances, change the port value.


2. Run phpMyadmin container:

```bash
make pma
```

3. Open the `your-app-domain.com:PMA_EXT_PORT` URL in the browser to access phpMyadmin. For example, we use `PMA_EXT_PORT=8801`. Open `your-app-domain.com:8801`


⚠️  **WARNING 📣 Do not use phpMyadmin on public (production or open stage), it's not secure!**

### Reset database root password
1. In `docker-compose.yml` file uncomment `command: --skip-grant-tables` in mariadb service
2. Restart containers:
```bash
make restart
```
3. Enter inside mariadb container:
```bash
make exec mariadb
```
4. Inside container run:

```bash
mariadb --ssl=OFF
```

```bash
FLUSH PRIVILEGES; ALTER USER 'root'@'%' IDENTIFIED BY 'new_password';
```
Where 'new_password' - new root password

You can reset another database user password too - just change the username, host, and add new password.

For example, there are two `root` users in database - with `%` host and with `localhost`. Use this command to see all users:

```bash
SELECT User, Host FROM mysql.user;
```

5. Revert back changes in `docker-compose.yml`

6. Restart containers:
```bash
make restart
```