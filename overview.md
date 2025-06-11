# Overview

**StarterKit** is a baseline WordPress environment template built for rapid project initiation.  
It provides a **preconfigured Docker-based infrastructure** and a **custom starter WordPress theme** designed for modern development workflows. The kit simplifies the handling of **sensitive data**, and supports **flexible configuration** across multiple environments.

The **primary goal** is to **streamline the development and deployment process** for developers and DevOps engineers — from local development to full-scale production.  
The solution includes several integrated components — **containers**, **scripts**, and **configuration layers** — which **automate repetitive tasks** and **enforce a standardized project structure**.

As a result, developers can **focus entirely on writing WordPress code**, instead of spending time configuring and maintaining the environment.

This stack combines **infrastructure** with a **custom WordPress theme featuring a fully integrated Bootstrap-based front-end**, supporting modern block-based editing (FSE) and SCSS/JS pipelines.  
It is composed of two main parts:

- **StarterKit Foundation** – provides Dockerized infrastructure, secret management, and CI/CD automation tooling using Terraform, Ansible, and GitHub Actions.
- **StarterKit Theme** – a customizable block-based WordPress theme built with Composer, SCSS, Laravel Mix, and Bootstrap 5, ready for rapid front-end and back-end development.

## Primary Goals

- **Rapid setup** – Get a working WordPress site with Docker in minutes.
- **Modern tooling** – Composer, Node.js, Laravel Mix, SCSS/JS compilation, and Carbon Fields are included out-of-the-box.
- **Environment parity** – The same code and containers run locally, on staging, and in production.
- **Built-in DevOps** – Terraform, Ansible, and GitHub Actions pipelines automate infrastructure provisioning and deployments.
- **Extensibility** – Open-source (MIT) and designed for easy customization.

## Key Advantages

- **Quick start** – Spin up a full local WordPress stack with `make install`. The command builds containers, installs WordPress, required packages, and prepares the database automatically.
- **Convenient configuration** – All parameters (application name, domains, ports, keys, etc.) live in layered `.env` files. Secrets are stored separately and generated automatically for improved security.
- **Universal environment** – Containers cover the web server, PHP/WordPress, the database, plus helper services like Node.js, phpMyAdmin, and MailHog. This supports both developers (asset builds, live reload) and DevOps (DB management, backups, CI/CD).
- **Scalable to production** – Terraform describes cloud infrastructure, while Ansible automates software installation on servers, applying the same configuration patterns on staging and production.
- **Open-source & extensible** – Distributed under the MIT license and structured for community contributions. You can extend scripts and code to suit specific needs without breaking the core architecture.
 