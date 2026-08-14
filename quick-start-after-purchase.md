# Quick start after purchase

You've just bought a license — this page takes you from an empty StarterKit Foundation project to
a working `composer update`. The checkout success page and the purchase email show the same steps
with your real license key, email, and licensing host already filled in — copy the ready-made line
from there rather than retyping it here.

## 1. Your license key

The license key is the Composer HTTP-basic **password**; the email address you used at checkout is
the **username**. Keep the key private — never commit it to a repository or paste it into a public
issue.

## 2. Composer credentials — config/environment/.env.secret

Add one line to `config/environment/.env.secret` in your StarterKit project — unescaped JSON, one
line, no spaces:

```bash
COMPOSER_AUTH={"http-basic":{"<licensing-host>":{"username":"<your-email>","password":"<your-license-key>"}}}
```

The file is gitignored — never commit it. The Composer container reads `COMPOSER_AUTH` from it
automatically. See [Environment & Secrets](environment-and-secrets.md) for the full environment
file layout.

## 3. CI/CD (GitHub Actions) — repository secret

GitHub → Settings → Secrets and variables → Actions → New repository secret. Name it
`COMPOSER_AUTH` and paste **only** the value, with no `COMPOSER_AUTH=` prefix. GitHub requires the
**escaped** form (every `"` backslash-prefixed), which is why it differs from step 2:

```bash
{\"http-basic\":{\"<licensing-host>\":{\"username\":\"<your-email>\",\"password\":\"<your-license-key>\"}}}
```

See [CI/CD Deployments](ci-cd-deployments.md) for how the deploy pipeline consumes this secret.

## 4. composer.json — repository and modules

A StarterKit Foundation project already ships both entries below — this step is only for a project
that lost them, or one that was not built on Foundation. `repositories[0]` points at the licensing
repository, and one `require` entry per granted module is added at `"*"`; constraints are left at
`*` and should be pinned per project.

```json
{
    "repositories": [
        {
            "type": "composer",
            "url": "https://<licensing-host>"
        }
    ],
    "require": {
        "solidbunch/<module-slug>": "*"
    }
}
```

## 5. Install the modules

From the project root, run Composer inside its dedicated container — never on the host, never
`docker compose run` directly. See [Composer usage](composer-usage.md) for why: ownership/UID
mismatch and version skew.

```bash
make run composer
composer update
```

Granted modules land in `kit-modules/`.

## Verify the install

Check `composer.lock`: a licensed module has a real `"dist"` block (`"type": "zip"`, a real URL).
Without valid credentials, Composer degrades the package to `"type": "metapackage"` **instead of
failing loudly** — that is the single most important thing on this page.

```bash
grep -A4 '"name": "solidbunch/<module-slug>"' composer.lock
```

A good entry looks like this:

```json
"name": "solidbunch/<module-slug>",
"dist": {
    "type": "zip",
    "url": "https://<licensing-host>/..."
}
```

A bad entry (no real credentials, or license does not grant the module) looks like this:

```json
"name": "solidbunch/<module-slug>",
"type": "metapackage"
```

Also run `ls kit-modules/` — it should show real directories containing code, not just an empty or
missing folder.

## When it does not work

- **401 Unauthorized / "Invalid credentials" while downloading from the licensing repo.** Wrong
  email or wrong key — a typo, a trailing space, wrong quoting in the JSON, or the escaped form
  used in `.env.secret` instead of the unescaped one. Fix: re-copy both values from the success
  page or the purchase email, then re-run `make run composer` and `composer update`.
- **Package installed but composer.lock says `"type": "metapackage"`.** Credentials worked, but the
  license does not grant that module (for example, a Free/Pro tier asked for an Enterprise-only
  module). Nothing is broken locally — the fix is an upgraded license, not a config change.
- **Everything worked before and now returns the same 401-style failure.** The license has expired
  — not a typo. Fix: renew the license, then re-run the install; the key itself does not change on
  renewal unless the storefront says otherwise.

## Next steps

- [Installation](installation.md)
- [Composer usage](composer-usage.md)
- [Environment & Secrets](environment-and-secrets.md)
- [CI/CD Deployments](ci-cd-deployments.md)
