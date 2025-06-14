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