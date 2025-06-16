# Production Launch with HTTPS

1. Place your certificate files in `./config/nginx/ssl/` with the names `<your-app-domain.com>.crt` and `<your-app-domain.com>.key`.
2. Update the variable `APP_PROTOCOL=https` in your `.env.type.prod` file to enable HTTPS.
3. Start containers with HTTP to HTTPS redirect:

```bash
make up prod
```

The configuration file `./config/nginx/templates/config/https.conf.template` will be used instead of `./config/nginx/templates/config/http.conf.template`
