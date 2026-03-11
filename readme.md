# Alma ACR Simulator

## Overview

Alma ACR Simulator is a small, frontend-only web SPA used to demonstrate and test authentication requirements based on:

- **AMRs** (authentication methods)
- **ACRs** (authentication class requirements)
- **Users** (enrolled means)
- **Sessions** (past authentication actions and timestamps)

It lets you simulate authentication events (e.g. “validate an AMR now”), enroll users into new AMRs, and check whether a given session satisfies a target ACR (or what is missing).

## Disclaimer (vibe coded)

This project was “vibe coded” as a quick demonstrator/prototype to validate ideas and iterate fast.  
It is **not production-ready** and should not be used as-is for security-critical logic or as a reference implementation for real authentication systems 
Especially the core functions that calculate the authentcation actions requirements based on session passed actions 

## Features

- Display mode + edit mode (JSON) for: AMRs, ACRs, Users, Sessions
- Session simulator:
  - Evaluate an ACR against a session
  - Show required actions and missing enrollments
  - Enroll an AMR for the session user
  - Trigger “authentication events” (validate an AMR now)
- Local persistence via `localStorage`

## Requirements

- Node.js (recommended: LTS)
- npm (or yarn/pnpm)

## How to run locally

From the project root:

```
npm install
npm run dev
```

Then open:

- http://localhost:3000

## Build / run production

```
npm run build
npm run start
```

## Deploy

This project can be deployed as a static Next.js site on Vercel:

- Push the repo to GitHub/GitLab
- Import the project in Vercel
- Deploy

## Notes

- The app is frontend-only and stores state in `localStorage`. If you want a clean slate, clear site storage in your browser.