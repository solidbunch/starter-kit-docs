## Advanced Installation Options

If you prefer not to use the default git clone flow, or you're working in a restricted environment, the following alternative installation methods are supported:

---

### 1. Create a New GitHub Repository (Template)

You can generate a new GitHub repository using this Starter Kit as a base:

➡️ [Generate a new GitHub repository](https://github.com/solidbunch/starter-kit-foundation/generate)

> This method creates a fresh project under your account with its own Git history. Ideal for clean starts, production projects, or migrating legacy sites into a modern stack.

---

### 2. Clone via SSH

```bash
git clone git@github.com:solidbunch/starter-kit-foundation.git my-project
```

✅ Requires [SSH key setup](https://docs.github.com/en/authentication/connecting-to-github-with-ssh). Recommended for teams and long-term development workflows.

---

### 3. Download as ZIP

* Go to: [https://github.com/solidbunch/starter-kit-foundation](https://github.com/solidbunch/starter-kit-foundation)
* Click **Code → Download ZIP**
* Extract and rename the folder as needed

✅ No Git required. Ideal for beginners or quick exploration.

---

### 4. Composer

```bash
composer create-project solidbunch/starter-kit my-project
```

✅ Requires PHP and Composer. Suitable for CI/CD and PHP-centric workflows.

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
