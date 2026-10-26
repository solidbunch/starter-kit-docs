# Advanced Installation Options

If you prefer not to use the default git clone flow, or you're working in a restricted environment, the following alternative installation methods are supported:

---

### 1. Scaffold a New GitHub Repository (Template)

You can generate a new GitHub repository using this Starter Kit as a base:

➡️ [Generate a new GitHub repository](https://github.com/solidbunch/starter-kit-foundation/generate)

> This method creates a fresh project under your account with its own Git history. Ideal for clean starts, production projects, or migrating legacy sites into a modern stack.

After generating, clone your new repository:

```bash
git clone https://github.com/your-org/your-project.git
```

And install the stack (following the same steps as in the main installation guide):

```bash
cd your-project
make install
```

---

### 2. Clone via SSH

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-project
```

✅ Requires [SSH key setup](https://docs.github.com/en/authentication/connecting-to-github-with-ssh). Recommended for teams and long-term development workflows.

After cloning, create a new Git repository and update the remote origin:

```bash
rm -rf .git                                                          # Remove existing Git history
git init                                                             # Initialize a new Git repository
git remote add origin git@github.com:your-username/your-project.git  # Add your new remote repository
```

This converts the StarterKit into your own standalone project — with a fresh Git history, ready to develop and deploy.


---

### 3. Download as ZIP

* Go to: [https://github.com/solidbunch/starter-kit-foundation](https://github.com/solidbunch/starter-kit-foundation)
* Click **Code → Download ZIP**
* Extract and rename the folder as needed

✅ No Git required. Ideal for beginners or quick exploration.

---

### 4. Composer

> ⚠️ This method needs a license. `basis`, `monitoring-client` and `monitoring-server` are paid modules that Composer downloads from a private repository. Set your license credentials in Composer's global `COMPOSER_AUTH` before running the command, or it fails. See [Quick start after purchase](quick-start-after-purchase.md).

```bash
composer create-project solidbunch/starter-kit-foundation my-project
```

✅ Requires PHP and Composer. Suitable for CI/CD and PHP-centric workflows. Check the required PHP version in the [StarterKit's `composer.json`](https://github.com/solidbunch/starter-kit-foundation/blob/main/composer.json).

---

### 5. GitHub CLI

```bash
gh repo create my-project --template=solidbunch/starter-kit-foundation --public
```

✅ For users of the `gh` CLI. Ideal for automation and scripting.

---

## Summary Table

| Method          | Git Required | SSH Required | Best For                         |
| --------------- | ------------ | ------------ | -------------------------------- |
| GitHub Template | ❌            | ❌            | Fresh projects, production setup |
| HTTPS Clone     | ✅            | ❌            | Default flow (see: Installation) |
| SSH Clone       | ✅            | ✅            | Teams, remote development        |
| ZIP Download    | ❌            | ❌            | Evaluation, offline work         |
| Composer        | ✅            | ❌            | PHP workflows, CI environments   |
| GitHub CLI      | ✅            | Optional     | Scripted project bootstrapping   |
