# Automatic backups
The system has automatic backups. Launched by a cronjob. By default, daily and weekly backups work. With a retention period of 6 and 30 days, respectively. You can customize the frequency and content of backups yourself.

Backups are enabled by default (`APP_WP_BACKUP_ENABLE=1` in every `config/environment/.env.type.*` file). To adjust:

1. Edit `./config/environment/.env.type.[environment_type]` file - toggle `APP_WP_BACKUP_ENABLE`


2. Check crontab file in `./config/cron/crontabs` - change cronjob time if it needs.


3. If you have more than one database (maybe custom databases), check `mariadb-dump` command parameters in `./sh/database/export.sh`, called by `./sh/cron/start-backup.sh`

Backups will appear in the `./backups` folder, logs in the docker cron container logs
