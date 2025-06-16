# CI/CD Deployments
Use GitHub Actions, GitLab CI/CD or other pipelines.

1. Add deploy public key to `~/authorized_keys` file on servers (use `make terraform apply` command if you haven't already done so)
2. Check required apps already installed on servers (use `make ansible` command if you haven't already done so)
3. Add secrets variables to repo options:

- `SSH_KEY` - Private key from deploy pair that used for servers access
- `SSH_CONFIG` - SSH config for servers with address, port, user, etc. See the example
- `COMPOSER_AUTH` - [Composer authentication](https://getcomposer.org/doc/articles/authentication-for-private-packages.md) JSON object with Personal Access Token, see [Managing your personal access tokens on GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
  and [Personal access tokens on GitLab](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html). For local usage in `.env.secret` file use a serialized **unescaped** JSON object without spaces, for GitHub secrets use **escaped** JSON object without spaces.

SSH config example:
```conf
# SSH_CONFIG
Host *
   IdentitiesOnly yes
   StrictHostKeyChecking no

# Develop server ssh alias
Host develop.starter-kit.io
  HostName 00.00.00.00
  User serverusername
  Port 22

# Prod server ssh alias
Host starter-kit.io
  HostName 00.00.00.00
  User serverusername
  Port 22

```

COMPOSER_AUTH example for GitHub secrets:
```bash
{\"github-oauth\":{\"github.com\":\"ACCESS_TOKEN_GITHUB\"}}
```

COMPOSER_AUTH example for local usage:
```bash
{"github-oauth":{"github.com":"ACCESS_TOKEN_GITHUB"}}
```

4. Check CI/CD jobs config file, use `./.github` for GitHub Actions
5. Push some changes to deployment branch and check pipelines logs
