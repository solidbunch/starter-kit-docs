# Platform Notes

This project is designed to work across all major development environments using Docker. Below are platform-specific notes and recommendations to ensure a smooth setup.

---

## Linux

✅ Fully supported and recommended.

Most Linux distributions include native support for Docker, Docker Compose, Make, and Git. 

[Install Docker Engine](https://docs.docker.com/engine/install/) v24+ (includes Compose v2)

Use your package manager to install dependencies:

```bash
sudo apt install make git
```

Ensure your user is added to the `docker` group:

```bash
sudo usermod -aG docker $USER
```

Log out and back in for the group change to take effect.

---

## macOS

✅ Fully supported.

[Install Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

Install required tools via [Homebrew](https://brew.sh):

```bash
brew install make git
```

---

## Windows (WSL2 Required)

⚠️ **Windows requires WSL2**. Native Windows Docker setups are not supported.

### Step-by-Step Setup

1. **Install WSL2**
   Follow [Microsoft’s official guide](https://learn.microsoft.com/en-us/windows/wsl/install) to install WSL2 and set up a Linux distribution (e.g., Ubuntu).


2. **Install Docker in WSL**

**Do not use Docker Desktop for Windows** it is not supported.

Install Docker Engine **directly inside WSL**. See [Docker in WSL2](https://docs.docker.com/engine/install/ubuntu/). This includes Docker Compose v2.

3. **Verify Docker Access** Run:

   ```bash
   docker version
   ```

   If you see version info, Docker is working.

4. **Install Dependencies inside WSL**

   Open a WSL terminal and run:

   ```bash
   sudo apt update
   sudo apt install make git
   ```

### ⚠️ Important Notes

* Always clone your project **inside the WSL filesystem** (e.g., `/home/youruser/project`). Avoid mounting Windows paths (e.g., `/mnt/c/...`) to prevent permission issues and performance degradation.
* Run all `make` commands inside the WSL terminal.

---

## Summary

| Platform | Docker Support       | Notes                       |
|----------|----------------------|-----------------------------|
| Linux    | ✅ Native             | Recommended for performance |
| macOS    | ✅ via Docker Desktop | Use Homebrew for tooling    |
| Windows  | ⚠️ WSL2 required     | Clone projects inside WSL   |

---

> 💡 Having issues with Docker or permissions? See [Troubleshooting](troubleshooting.md) for common solutions.
