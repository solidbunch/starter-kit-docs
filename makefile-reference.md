# Makefile commands

- `make install [environment_type]`
- `make secret`
- `make watch` - run node watcher
- `make up [environment_type]` - `docker compose up -d --build`
- `make upd [environment_type]` - `docker compose up --build`
- `make down` - `docker compose down -v`
- `make restart` - `docker compose restart`
- `make recreate` - `docker compose up -d --build --force-recreate`
- `make import <sql_file_name>` - import sql file to WordPress database
- `make export` - will export current database to sql file
- `make replace [search_domain] [replace_domain]` -  search replace domain in the database
- `make pma`
- `make run <service_name>` - `docker compose run -it --rm .... <service_name> ...`
- `make exec <service_name>` - `docker compose exec -it .... <service_name> ...`
- `make lint` - run php, js, and css linters
- `make docker clean` - remove all built containers, images, volumes, etc