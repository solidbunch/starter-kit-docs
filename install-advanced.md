## Advanced Installation Options

If you prefer not to use the GitHub template flow, or you're working in a restricted environment, here are other ways to install the StarterKit:

---

### 1. Clone via HTTPS (recommended for most users)

```bash
git clone https://github.com/solidbunch/starter-kit-foundation.git my-project
cd my-project
rm -rf .git
git init
```

✅ **Works without SSH keys.** Best for quick setup and full control of code.

> 🔐 If you want to push code to GitHub, you’ll need to set a [GitHub SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) or add a [Personal Access Token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

---

### 2. Clone via SSH (for experienced developers)

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-project
```

✅ Requires [SSH key setup](https://docs.github.com/en/authentication/connecting-to-github-with-ssh). Best for long-term collaboration and pushing code securely.

---

### 3. Download as ZIP (manual installation)

* Go to: [https://github.com/solidbunch/starter-kit-foundation](https://github.com/solidbunch/starter-kit-foundation)
* Click **Code → Download ZIP**
* Extract and rename the folder as needed

✅ No Git required. Ideal for beginners or quick exploration.

---

### 4. Composer (advanced PHP users)

If the Starter Kit is registered as a Composer package:

```bash
composer create-project solidbunch/starter-kit my-project
```

✅ Requires PHP and Composer locally. Suitable for integration into automated PHP workflows.

---

### 5. GitHub CLI (optional)

```bash
gh repo create my-project --template=solidbunch/starter-kit-foundation --public
```

✅ For those using `gh` CLI. Fast and scriptable method for bootstrapping a repo.

---

## Summary

| Method          | Git Required  | SSH Required | Best For                       |
|-----------------|---------------|--------------|--------------------------------|
| GitHub Template | ❌ (initially) | ❌            | Beginners, clean project start |
| HTTPS Clone     | ✅             | ❌            | Most developers, simple setup  |
| SSH Clone       | ✅             | ✅            | Teams with SSH, active push    |
| ZIP Download    | ❌             | ❌            | Offline use, quick inspection  |
| Composer        | ✅             | ❌            | PHP automation & CI/CD         |
| GitHub CLI      | ✅             | depends      | Scripted bootstrapping         |
