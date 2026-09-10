# Wildcat Brewing Wholesale Manager

Internal wholesale order management system for Wildcat Brewing.

## Live site

GitHub Pages serves the app from the `main` branch and repository root.

## Project structure

```text
wholesale_page/
├─ index.html
├─ assets/
│  ├─ css/
│  │  └─ style.css
│  ├─ js/
│  │  └─ app.js
│  └─ images/
│     └─ wildcat-logo.png
├─ README.md
└─ .nojekyll
```

## Features

- Dynamic wholesale orders
- Boxes/cans and kegs
- Preparation totals by beer
- Priority: Low, Normal, High, Urgent
- Workflow: Not Started → Preparing → Ready → Out for Delivery → Delivered
- On-hold orders
- Customer management
- Delivery date and method
- Payment status
- Edit and remove orders
- Mobile-friendly layout
- Realtime Supabase updates
- Staff-only authentication

## Backend

Supabase stores customers, beers, orders, order items, status history and staff access. The frontend uses only the Supabase publishable key; business data remains protected by Row Level Security and the staff allowlist.

## Hosting

The frontend is static and can run for free on GitHub Pages. The database and authentication stay in the separate `wildcat-ops` Supabase project.
