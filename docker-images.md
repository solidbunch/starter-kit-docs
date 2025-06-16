# Docker Images

Image names are defined in `./config/environment/.env.main`. Images are pulled from the registry by Docker. Use a custom containers registry for your project's Docker containers, such as [GitHub Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) or [Docker Hub](https://docs.docker.com/guides/walkthroughs/publish-your-image/).

To build and push images to the registry, use the following commands from the root of your project directory:

```bash
make docker build
```
```bash
make docker push
```