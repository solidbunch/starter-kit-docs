# Docker Images

Image names are defined in `./config/environment/.env.main`. Images are pulled from the registry by Docker. Use a custom containers registry for your project's Docker containers, such as [GitHub Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) or [Docker Hub](https://docs.docker.com/guides/walkthroughs/publish-your-image/).

To build and push images to the registry, use the following commands from the root of your project directory:

```bash
make docker build
```
```bash
make docker push
```

The `mariadb` image has a version guard (it refuses to start on data from another MariaDB release series, `major.minor`).
A host gets it only from an image published under a **new tag** that `APP_DATABASE_IMAGE` points
to — `docker compose up` does not re-pull a tag that already exists on the host. Check:

```bash
docker inspect --format '{{json .Config.Entrypoint}}' $(docker compose ps -q mariadb)
```

`["/docker-entrypoint.sh"]` means the guard is present, `["docker-entrypoint.sh"]` means the
official entrypoint only. Upgrade steps: [Upgrading MariaDB version](database-management.md#upgrading-mariadb-version).
