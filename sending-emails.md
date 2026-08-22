# Sending emails

Mail is not routed by the Docker containers, you must use an SMTP external service to route your site's email.

The reason that mail is not routed is that configuring mail to route from the proper domain on a server is often a headache. A further headache is actually getting mail delivered from an arbitrary IP. A third issue is that mail servers consume resources. A fourth issue is security. So for all these reasons we decided not to implement mail and instead delegate that task to various providers.

You can set up an SMTP service like Gmail, AWS SES, Sendinblue, Mailgun, etc., or use another server you like.

Just edit SMTP config block in your `.env.main` and `.env.secret` files.

`.env.main`:
```bash
# SMTP config
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# none|ssl|tls
SMTP_SECURE=tls
# 0=off, 1=client commands, 2=+server responses, 3=+connection status, 4=low-level/all
SMTP_DEBUG=0
```

`SMTP_DEBUG` output goes to PHP's `error_log()`, which lands in the `php` container's logs — check
it with `make log php`.

`.env.secret`:
```bash
SMTP_USER=your_smtp_service_user_name
SMTP_PASS=your_smtp_service_user_password
```

Also, to debug Emails on local you can use [MailHog](https://github.com/mailhog/MailHog) service. Just run:

```bash
make mailhog
```

`.env.type.local` file already has mailhog connection settings.

This will run MailHog container, and you can access it on `your-app-domain.com:8025` URL.
