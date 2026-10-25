# Docker Images

Image names are defined in `./config/environment/.env.main`. Images are pulled from the registry by Docker. Use a custom containers registry for your project's Docker containers, such as [GitHub Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) or [Docker Hub](https://docs.docker.com/guides/walkthroughs/publish-your-image/).

To build and push images to the registry, use the following commands from the root of your project directory:

```bash
make docker build
```
```bash
make docker push
```

The `mariadb` image wraps the official entrypoint with a version guard that refuses to start the
server when the image's MariaDB version differs from the one that last upgraded the data
directory. Because the guard lives in the image, a host only gets it once an image that contains
it is published under a **new tag** and `APP_DATABASE_IMAGE` points to it — never overwrite a tag
that hosts have already pulled, since `docker compose up` does not re-pull a tag that exists
locally. See [Upgrading MariaDB major version](database-management.md#upgrading-mariadb-major-version)
for the upgrade procedure.