# Automatic backups
A cron job runs automatic backups: daily and weekly by default, kept for 6 and 30 days respectively. You can customize the frequency and content yourself.

Backups are on by default (`APP_WP_BACKUP_ENABLE=1` in every `config/environment/.env.type.*` file). To change this, do any of the following:

1. To turn backups off, set `APP_WP_BACKUP_ENABLE=0` in `./config/environment/.env.type.[environment_type]`


2. Check crontab file in `./config/cron/crontabs` - change cronjob time if it needs.


3. If you have more than one database (maybe custom databases), check `mariadb-dump` command parameters in `./sh/database/export.sh`, called by `./sh/cron/start-backup.sh`

Backups will appear in the `./backups` folder, logs in the docker cron container logs
