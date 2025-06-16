# Automatic backups
The system has automatic backups. Launched by a cronjob. By default, daily and weekly backups work. With a retention period of 7 and 31 days, respectively. You can customize the frequency and content of backups yourself.

To activate backups:

1. Edit `./config/environment/.env.type.[environment_type]` file - enable `APP_WP_BACKUP_ENABLE`


2. Check crontab file in `./config/crontabs` - change cronjob time if it needs.


3. If you have more than one database (maybe custom databases), check `mariadb-dump` command parameters in `./docker/cron/start-backup.sh`

Backups will appear in the `./backups` folder, logs in the docker cron container logs
