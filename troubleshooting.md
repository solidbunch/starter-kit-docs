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

If problems persist, open an issue and attach the full output of the command.

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

GitHub API limit (60 calls/hr) is exhausted, could not fetch https://api.github.com/repos/solidbunch/starter-kit-theme/contents/composer.json?ref=724fec0abf049941b48bd2b7efc292a1ffc7f9e1. Create a GitHub OAuth token to go over the API rate limit. You can also wait until 2025-06-17 16:57:27 for the rate limit to reset.

When working with _public_ GitHub repositories only, head here to retrieve a token:
https://github.com/settings/tokens/new?scopes=&description=Composer+on+c309d9a51f82+2025-06-17+1600
This token will have read-only permission for public information only.
When you need to access _private_ GitHub repositories as well, go to:
https://github.com/settings/tokens/new?scopes=repo&description=Composer+on+c309d9a51f82+2025-06-17+1600
Note that such tokens have broad read/write permissions on your behalf, even if not needed by Composer.
Tokens will be stored in plain text in "/home/www-data/.composer/auth.json" for future use by Composer.
For additional information, check https://getcomposer.org/doc/articles/authentication-for-private-packages.md#github-oauth
Token (hidden): 
