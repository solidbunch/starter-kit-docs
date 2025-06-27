# Troubleshooting 🐞

If something goes wrong, make sure that:

### Docker is running

If Docker is not running, you'll see a connection error.

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
```

Check Docker status:

```bash
docker info
```

And check running containers:

```bash
docker ps
```

### Your SSH key has access to GitHub

If you have an error like:

```text
Permission denied (publickey).
```

Or
```text
fatal: Could not read from remote repository.
``` 

Verify SSH access to GitHub:

```bash
ssh -T git@github.com
```

You should see a message like:
```text
Hi <username>! You've successfully authenticated...
```  
If you see an error, ensure your SSH key is added to your GitHub account. Follow [GitHub's guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) to set it up.

Use SSH config to simplify access:

```bash
cat <<EOF >> ~/.ssh/config
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_rsa
EOF
```

> 💡 **Tip:** If you already have a `~/.ssh/config` file, check it for existing GitHub entries to avoid duplicates.

### All required `.env.*` files are present and valid

Ensure files like `.env.main`, `.env.secret`, `.env.type.*` exist and are correctly filled.

- `.env.secret` will only be generated if a valid template exists (`sh/env/.env.secret.template`)
- If needed, delete root `.env` and rerun:

```bash
make env
```

### Required ports are available

Common error when a port is taken:

```text
Error starting userland proxy: listen tcp 0.0.0.0:80: bind: address already in use
```

Make sure ports `80`, `443` are not in use:

Check ports:

```bash
sudo lsof -i :80
sudo netstat -tulpn | grep -E '80|443'
```

If a port is occupied, you will see the process PID. To stop it:

```bash
sudo kill <PID>
```

> ⚠️ Note: Ensure no other local web server (e.g. Apache, MAMP, or LAMP) is running — it can block Docker from binding to required ports.

### Check nginx logs for TLS or routing issues

```bash
make log nginx
```

### Check all docker logs

```bash
make log
```

Or use specific service logs:

```bash
make log [service_name]
```
Where `service_name` can be name of docker compose service, e.g. `nginx`, `php`, `mariadb`, etc.

---

## Full Reset

If issues persist, you can wipe everything and start clean:

```bash
make docker clean
```

It will remove all Docker containers, images, and volumes associated with this project - **excluding the database volume**, which is preserved to avoid data loss.

Then re-run the installation:

```bash
make install
```

---

## Composer install/update fails with `Could not delete wp-core/wp-content`

**Symptom:**

Running:
```bash
make run composer
composer install/update
```

fails with an error similar to:

```text
Could not delete /srv/web/wp-core/wp-content: 
Install of solidbunch/wordpress-core failed
```

**Cause:**

The `php` container is running and holds a lock on the `web/wp-core/wp-content` directory. Composer cannot replace the `solidbunch/wordpress-core` package while this directory exists.

**Resolution:**

Stop all running containers:

```bash
make down
```

Delete the empty `web/wp-core/wp-content` directory:

```bash
rm -r web/wp-core/wp-content
```

> ⚠️ Make sure the directory is empty before deleting.
> The command will fail if it's not empty — this is intentional.


Run Composer again:

```bash
composer update
```

---

## Stop and remove all running containers

**Symptom:**

* containers are running but unresponsive,
* source files were deleted or changed outside Docker,
* volumes are out of sync,
* `make` commands no longer work as expected.

**Cause:**

The Docker environment may be in an inconsistent state — for example, containers are still running but no longer match the current project structure.

**Resolution:**

```bash
docker ps -a
docker stop $(docker ps -q)
docker rm $(docker ps -aq)
```

(Optional) Also remove dangling volumes if necessary:

```bash
docker volume prune
```

Or
```bash
make docker prune
```

---

## GitHub API limit (60 calls/hr) is exhausted

**Problem:**
Composer fails to fetch dependencies because the unauthenticated GitHub API rate limit (60 requests/hour) has been exceeded.

**Solutions:**

Generate a token at [https://github.com/settings/tokens](https://github.com/settings/tokens) (no scopes needed).

Add it to a secret environment file:

In `.env.secret`:

```env
COMPOSER_AUTH={"github-oauth":{"github.com":"XXXXX"}}
```


Or Use SSH instead of HTTPS:

If you have SSH access set up:

```json
{
 "type": "vcs",
 "url": "git@github.com:solidbunch/starter-kit-theme.git"
}
```

This avoids GitHub API calls entirely and always uses `git clone`.

---

## 🛠️ Docker Disk Troubleshooting

### Quick Checks

```bash
docker system df          # Overall Docker usage summary  
docker ps -s              # Container sizes incl. writable layer (logs)  
docker images             # Image sizes  
docker volume ls          # List volumes  
docker volume prune       # Remove unused volumes  
docker builder prune      # Clean build cache  
docker system prune -a    # Remove all unused images, containers, networks
```

---

### Check Log Path (Linux)

```bash
docker inspect --format='{{.LogPath}}' <container_id>  
ls -lh /var/lib/docker/containers/<container_id>/*-json.log
```

---

### Check Log Path (Mac)

```bash
docker inspect --format='{{.LogPath}}' <container_id>
# Direct file access limited (logs stored inside Docker Desktop VM)
```

### Check log rotation options

`/etc/docker/daemon.json` should contain log rotation settings:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "10"
  }
}
```

```bash
docker inspect <container-name> --format '{{.HostConfig.LogConfig}}'
```

---

### System Disk Usage

```bash
df -h                     # Overall disk usage
```

---

## 🛠️ MariaDB Troubleshooting

### Crash recovery failed: Bad magic header in tc log

**Error:**

```
[ERROR] Bad magic header in tc log
[ERROR] Crash recovery failed.
[ERROR] Can't init tc log
[ERROR] Aborting
```

**Cause:** Corrupted `tc.log` (Transaction Coordinator Log) file.

**Solution (safe if you don't use XA transactions):**

```bash
make down
sudo rm -rf db-data/tc.log
make up
```

MariaDB will recreate `tc.log` on the next start.

---

If problems persist, open an issue and attach the full output of the command.