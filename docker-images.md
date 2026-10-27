# Docker Images

The names of the project's images are defined in `./config/environment/.env.main`. Docker pulls them from the registry; a tag that already exists on your machine is not pulled again. Use a custom containers registry for your project's Docker containers, such as [GitHub Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) or [Docker Hub](https://docs.docker.com/guides/walkthroughs/publish-your-image/).

`make docker build` builds all project images locally; add a service name to build one (`make docker build mariadb`). `make docker push` logs in to `ghcr.io` with the registry access token `CR_TOKEN` from `config/environment/.env.secret` (the template has it commented out), asks `y/n` for each image, then builds it for `linux/amd64` and `linux/arm64` and pushes it, so you do not need to run `build` first. For another registry, change the image names and the login in `sh/system/docker.sh`. Run both commands from the root of your project (the folder with the `Makefile`):

```bash
make docker build
```
```bash
make docker push
```

The `mariadb` image includes a version guard: it refuses to start when the data in `db-data/` belongs
to a different `major.minor` MariaDB version, or has no `mariadb_upgrade_info` file. Before you change the MariaDB version, check that your
running container has the guard (the stack must be running: `make up`):

```bash
docker inspect --format '{{json .Config.Entrypoint}}' $(docker compose ps -q mariadb)
```

- `["/docker-entrypoint.sh"]` — the guard is present.
- `["docker-entrypoint.sh"]` — the guard is missing. Point `APP_DATABASE_IMAGE` at a **new** image
  tag and recreate the container: `docker compose up` does not re-pull a tag that already exists on
  your machine.

The check shows whether a guard exists, not which comparison it makes. Images built with an older
guard compare the full `x.y.z` and refuse a patch-only change too; their log (`docker compose logs mariadb`) says
"another version" instead of "another release series". Handle that case like a `major.minor` change.

Upgrade steps: [Upgrading MariaDB version](database-management.md#upgrading-mariadb-version).
