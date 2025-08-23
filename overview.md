# Overview

**StarterKit** is a baseline WordPress environment template built for rapid project initiation.  
It provides a **preconfigured Docker-based infrastructure** and a **custom starter WordPress theme** designed for modern development workflow. The kit simplifies the handling of sensitive data, and supports flexible configuration across multiple environments.

[Watch the StarterKit overview video](https://youtu.be/uCQcxhVUsdc) to see how it works.

The **primary goal** is to **streamline the development and deployment process** for Developers and DevOps engineers — from local to full-scale production.  
The solution includes several integrated components — containers, scripts, and configuration layers — which automate repetitive tasks and enforce a standardized project structure.

As a result, developers can **focus entirely on writing code**, instead of spending time configuring and maintaining the environment.

This stack combines infrastructure with a custom WordPress theme featuring a fully integrated Bootstrap-based front-end, supporting modern block-based editing (FSE) and SCSS/JS pipelines.  
It is composed of two main parts:

- **StarterKit Foundation** – provides Dockerized infrastructure, secret management, and CI/CD automation tooling using Terraform, and GitHub Actions.
- **StarterKit Theme** – a customizable block-based WordPress theme built with Composer, SCSS, JSX, and Bootstrap 5, ready for rapid front-end and back-end development.

## Main Goals

- **Rapid setup** – Get a working WordPress site with Docker in minutes.
- **Modern tooling** – Composer, Node.js, SCSS/JS compilation, and Carbon Fields is included out-of-the-box.
- **Environment parity** – The same code and containers run locally, on staging, and in production.
- **Built-in DevOps** – Preconfigured Terraform and GitHub Actions pipelines handle infrastructure and deployments out of the box — no setup required.
- **Extensibility** – Open-source (MIT) and designed for easy customization.

## Key Advantages

- **Quick start** – Spin up a full local WordPress stack with a single `make install` command. It builds containers, installs WordPress, dependencies, and initializes the database automatically.
- **Absolute environment consistency** – All environments, local, development, staging, and production — run the exact same versions of software, services, infrastructure, and configuration. This eliminates the classic “works on my machine” problem and ensures predictable behavior across the entire lifecycle.
- **Convenient configuration** – All parameters (application name, domains, ports, keys, etc.) live in layered `.env` files. Secrets are stored separately and generated automatically for improved security.
- **Universal environment** – Containers cover the web server, PHP/WordPress, the database, plus helper services like Node.js, phpMyAdmin, and MailHog. This supports both Developers (asset builds, live reload) and DevOps (DB management, backups, CI/CD).
- **Integrated DevOps** – Everything is ready to use: Terraform defines cloud infrastructure, Ansible configures the servers, and CI/CD pipelines automatically deploy to staging and production — using the same setup across all environments.
- **Open-source & extensible** – Distributed under the MIT license and structured for community contributions. You can extend scripts and code to suit specific needs without breaking the core architecture.
