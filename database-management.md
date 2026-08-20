# Database management
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