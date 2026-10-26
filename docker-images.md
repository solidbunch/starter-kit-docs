# Docker Images

Image names are defined in `./config/environment/.env.main`. Images are pulled from the registry by Docker. Use a custom containers registry for your project's Docker containers, such as [GitHub Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) or [Docker Hub](https://docs.docker.com/guides/walkthroughs/publish-your-image/).

To build and push images to the registry, use the following commands from the root of your project directory:

```bash
make docker build
```
```bash
make docker push
```

The `mariadb` image includes a version guard: it refuses to start when the data in `db-data/` belongs
to a different `major.minor` MariaDB version, or has no `mariadb_upgrade_info` file. Before you change the MariaDB version, check that your
running container has the guard:

```bash
docker inspect --format '{{json .Config.Entrypoint}}' $(docker compose ps -q mariadb)
```

- `["/docker-entrypoint.sh"]` — the guard is present.
- `["docker-entrypoint.sh"]` — the guard is missing. Point `APP_DATABASE_IMAGE` at a **new** image
  tag and recreate the container: `docker compose up` does not re-pull a tag that already exists on
  your machine.

Upgrade steps: [Upgrading MariaDB version](database-management.md#upgrading-mariadb-version).
