# Chainpaye Deployment Guide

This document explains everything you need to know to deploy the Chainpaye application — from first-time setup to day-to-day deployments. No deep technical knowledge required.

---

## Table of Contents

1. [How the System Works](#1-how-the-system-works)
2. [What You Need Before You Start](#2-what-you-need-before-you-start)
3. [First-Time Setup](#3-first-time-setup)
4. [How to Deploy](#4-how-to-deploy)
5. [Watching a Deployment Run](#5-watching-a-deployment-run)
6. [Updating Environment Variables](#6-updating-environment-variables)
7. [Common Problems and Fixes](#7-common-problems-and-fixes)
8. [Quick Reference](#8-quick-reference)

---

## 1. How the System Works

Think of the deployment system like a factory assembly line. When you push code to GitHub, a series of automated checks and steps run — and if everything passes, the new code lands on the server automatically. You never need to SSH into the server or copy files manually.

### The Two Environments

| Environment | Branch | Server Folder | Purpose |
|---|---|---|---|
| **Staging** | `staging` | `~/staging` | Test new features before releasing |
| **Production** | `main` | `~/app` | The live app that real users see |

### The Rule

> **Always deploy to staging first. Only merge to main after staging is tested and working.**

### What Happens Automatically on Each Push

**When you push to `staging`:**
1. GitHub checks the code for TypeScript errors
2. If checks pass, files are copied to the server's `~/staging` folder
3. The staging app restarts automatically

**When you push to `main`:**
1. GitHub checks the code for TypeScript errors
2. GitHub compiles the TypeScript code into JavaScript
3. The compiled files are copied to the server's `~/app` folder
4. The production app reloads with zero downtime (no interruption to users)

---

## 2. What You Need Before You Start

### Things that must already exist

- A **GitHub account** with access to the Chainpaye repository
- The **AWS EC2 server** running (the single instance hosting both environments)
- The **SSH key file** for the server (a `.pem` file — the password to your server)
- The **environment variable files** (`.env.staging` and `.env.production`) with all API keys and configuration

### GitHub Secrets

These are like a secure password vault inside GitHub. The deployment pipeline reads them to connect to the server and configure the app. They are never visible in code or logs.

The following secrets must be set up in GitHub before deployments will work:

| Secret Name | What It Is |
|---|---|
| `EC2_HOST` | The server's public IP address (e.g. `3.236.104.77`) |
| `EC2_SSH_KEY` | The full content of the `.pem` key file |
| `SERVER_USER` | The server username — always `ubuntu` for AWS |
| `STAGING_ENV` | The full content of `.env.staging`, encoded in base64 |
| `PRODUCTION_ENV` | The full content of `.env.production`, encoded in base64 |

---

## 3. First-Time Setup

This section is for setting up the secrets the very first time, or after they need to be reset.

### Step 1 — Find your server's public IP

1. Log in to [AWS Console](https://console.aws.amazon.com)
2. Go to **EC2 → Instances**
3. Click your instance
4. Copy the **Public IPv4 address** (looks like `3.236.104.77`)

> ⚠️ The private IP (starts with `172.`) will NOT work. You need the public one.

### Step 2 — Add secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **New repository secret** for each item below

---

#### Secret: `EC2_HOST`

- Name: `EC2_HOST`
- Value: your server's public IP address
- Example: `3.236.104.77`

---

#### Secret: `SERVER_USER`

- Name: `SERVER_USER`
- Value: `ubuntu`

---

#### Secret: `EC2_SSH_KEY`

This is the private key file that proves you are allowed to connect to the server.

Open PowerShell on your computer and run:

```powershell
Get-Content "C:\path\to\your-key-file.pem" -Raw | Set-Clipboard
```

Replace `C:\path\to\your-key-file.pem` with the actual path to your `.pem` file.

That command copies the entire key file to your clipboard. Paste it as the secret value.

The value will look like this (do not change it):
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA...
...many lines...
-----END OPENSSH PRIVATE KEY-----
```

---

#### Secret: `STAGING_ENV`

This is your `.env.staging` file encoded so it can be safely stored.

Open PowerShell and run:

```powershell
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content "C:\Users\Pk\Desktop\Chainpaye\.env.staging" -Raw))) | Set-Clipboard
```

Paste the result (a long single line of letters and numbers) as the secret value.

---

#### Secret: `PRODUCTION_ENV`

Same process as `STAGING_ENV` but for the production file:

```powershell
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content "C:\Users\Pk\Desktop\Chainpaye\.env.production" -Raw))) | Set-Clipboard
```

Paste the result as the secret value.

---

### Step 3 — Verify the server has the required software

SSH into the server and check these are installed:

```bash
ssh -i "C:\path\to\your-key.pem" ubuntu@YOUR_SERVER_IP
```

Once connected:

```bash
node --version    # Should show v20 or higher
pnpm --version    # Should show version 10
pm2 --version     # Should show any version
```

If any of these are missing, install them:

```bash
# Install Node via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Install pnpm
npm install -g pnpm

# Install pm2
npm install -g pm2
pm2 startup   # Follow the printed instruction to enable auto-start on reboot
```

---

## 4. How to Deploy

### Deploy to Staging

This is what you do when you want to test new code on the server before releasing it to users.

```bash
git add .
git commit -m "describe what you changed"
git push origin HEAD:staging
```

That's it. GitHub will automatically run the checks and deploy.

### Deploy to Production

Only do this after you have tested on staging and everything works.

```bash
git checkout main
git merge staging
git push origin main
```

GitHub will automatically build and deploy to production.

### Force a Redeploy Without Code Changes

Sometimes you need to restart the app (e.g. after updating environment variables) without changing any code:

```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push origin HEAD:staging   # or main for production
```

---

## 5. Watching a Deployment Run

1. Go to your GitHub repository
2. Click the **Actions** tab at the top
3. You will see a list of recent workflow runs
4. Click on any run to see the details
5. Green checkmark = success, Red X = failed

Each workflow has two stages:
- **Type Check** (or **Type Check & Build** for production) — verifies the code is correct
- **Deploy** — copies files to the server and restarts the app

If the Type Check fails, the Deploy step will not run — the server is never touched.

---

## 6. Updating Environment Variables

Environment variables are things like API keys, passwords, and configuration values that the app needs to run. They live in `.env.staging` and `.env.production` on your local computer and are stored securely as GitHub Secrets.

### When do you need to update them?

- An API key expired (most common — WhatsApp tokens expire regularly)
- You added a new feature that needs a new configuration value
- A password or key was changed for security reasons

### Steps to update

**Step 1** — Edit the file on your computer

Open `.env.staging` or `.env.production` in any text editor and update the value.

**Step 2** — Re-encode the file

In PowerShell:

```powershell
# For staging
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content "C:\Users\Pk\Desktop\Chainpaye\.env.staging" -Raw))) | Set-Clipboard

# For production
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content "C:\Users\Pk\Desktop\Chainpaye\.env.production" -Raw))) | Set-Clipboard
```

**Step 3** — Update the GitHub Secret

1. Go to GitHub → Settings → Secrets and variables → Actions
2. Find `STAGING_ENV` or `PRODUCTION_ENV`
3. Click **Update**
4. Paste the new value
5. Click **Save**

**Step 4** — Trigger a redeploy

```bash
git commit --allow-empty -m "chore: update env variables"
git push origin HEAD:staging   # or main
```

The app will restart with the new configuration.

---

## 7. Common Problems and Fixes

### ❌ "Type Check Failed"

**What it means:** There is a coding error in the project. The code has a mistake that needs to be fixed before it can be deployed.

**What to do:** Look at the error in the Actions tab. It will say exactly which file and line number has the problem. A developer needs to fix it.

**The server is not affected** — nothing was deployed.

---

### ❌ "SSH: handshake failed / unable to authenticate"

**What it means:** GitHub could not connect to the server because the SSH key is wrong or missing.

**What to do:**

1. Test the key locally first:
   ```powershell
   ssh -i "C:\path\to\your-key.pem" ubuntu@YOUR_SERVER_IP "echo connected"
   ```
   If this prints `connected`, the key works.

2. If it works locally but not in the pipeline, the `EC2_SSH_KEY` secret has wrong content. Re-add it following the steps in Section 3.

3. If local SSH also fails, the key file is wrong. You may need to create a new SSH key and add it to the server (see the "Lost SSH Key" section below).

---

### ❌ "Permission denied (publickey)"

**What it means:** The SSH key you used is not recognized by the server — it's the wrong key for this server.

**What to do:**

1. Check which key pair the server uses: AWS Console → EC2 → your instance → Details tab → **Key pair name**
2. Find that `.pem` file on your computer
3. Update the `EC2_SSH_KEY` secret with the correct file

---

### ❌ "pnpm: command not found" (Exit code 127)

**What it means:** pnpm is not installed on the server, or the server can't find it.

**What to do:** SSH into the server and run:

```bash
npm install -g pnpm
```

Then push again to retrigger the deployment.

---

### ❌ App is deployed but crashing — "AxiosError 401"

**What it means:** The app is running but an API token has expired. The most common cause is the WhatsApp `GRAPH_API_TOKEN` expiring.

**What to do:**

1. Go to [Meta for Developers](https://developers.facebook.com) → your app → WhatsApp → API Setup
2. Generate a new token
3. Update `GRAPH_API_TOKEN` in your `.env.staging` or `.env.production` file
4. Follow the "Updating Environment Variables" steps above to push the new token to the server

> 💡 **Permanent fix:** Instead of a temporary token that expires, create a **System User Token** in Meta Business Suite. System user tokens never expire.

---

### ❌ App deployed but not responding

**What to do:** SSH into the server and check the PM2 status:

```bash
pm2 list
pm2 logs chainpaye-staging --lines 50   # for staging
pm2 logs chainpaye-prod --lines 50      # for production
```

The logs will show exactly what error is occurring.

---

### 🔑 Lost SSH Key (Can't Connect to Server)

If you lost your `.pem` file and can't SSH in:

1. Go to AWS Console → EC2 → your instance → **Connect** tab
2. Try **Session Manager** — this gives you a browser-based terminal without needing the key
3. Once in the terminal, generate a new key on your local machine:

   ```powershell
   ssh-keygen -t ed25519 -f C:\Users\Pk\Downloads\new-key -N ""
   ```

4. Copy the contents of `new-key.pub`:

   ```powershell
   Get-Content C:\Users\Pk\Downloads\new-key.pub
   ```

5. In the server terminal (via Session Manager), run:

   ```bash
   echo "PASTE_THE_PUB_KEY_CONTENT_HERE" >> ~/.ssh/authorized_keys
   ```

6. Test the new key locally, then update the `EC2_SSH_KEY` secret.

---

### ⚠️ Server IP Changed

AWS EC2 instances get a new public IP when they are stopped and started (not rebooted). If the server IP changes, update the `EC2_HOST` secret with the new IP.

**Permanent fix:** Assign an **Elastic IP** to the instance in AWS Console → EC2 → Elastic IPs. This gives the server a permanent IP that never changes. There is no extra cost as long as the IP is attached to a running instance.

---

## 8. Quick Reference

### Daily deployment in 3 commands

```bash
# 1. Save your changes
git add .
git commit -m "what you changed"

# 2. Deploy to staging (test it)
git push origin HEAD:staging

# 3. When staging is good, release to production
git checkout main && git merge staging && git push origin main
```

### Check if the app is running on the server

```bash
ssh -i "C:\path\to\key.pem" ubuntu@3.236.104.77 "pm2 list"
```

### Restart the app manually on the server

```bash
ssh -i "C:\path\to\key.pem" ubuntu@3.236.104.77 "pm2 restart chainpaye-staging"
# or
ssh -i "C:\path\to\key.pem" ubuntu@3.236.104.77 "pm2 restart chainpaye-prod"
```

### View live app logs on the server

```bash
ssh -i "C:\path\to\key.pem" ubuntu@3.236.104.77 "pm2 logs chainpaye-staging --lines 100"
```

### GitHub Secrets summary

| Secret | When to update |
|---|---|
| `EC2_HOST` | Server IP changes |
| `EC2_SSH_KEY` | SSH key is replaced |
| `SERVER_USER` | Never (always `ubuntu`) |
| `STAGING_ENV` | Any env variable changes for staging |
| `PRODUCTION_ENV` | Any env variable changes for production |

---

*Last updated: June 2026*
