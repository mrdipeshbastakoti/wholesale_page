# Wildcat Brewing Wholesale Manager

Internal wholesale order management system for Wildcat Brewing.

## Features

- Dynamic wholesale orders
- Cans / boxes and kegs
- Preparation totals by beer
- Priority: Low, Normal, High, Urgent
- Workflow: Not Started → Preparing → Ready → Out for Delivery → Delivered
- Customer management
- Delivery date and method
- Payment status
- Edit and delete orders
- Mobile-friendly layout
- Supabase authentication and database

## Hosting

Designed to run for free on GitHub Pages from the `main` branch, root folder.

## Security

The frontend contains only the Supabase publishable browser key. Business data is protected by Supabase Row Level Security and the Wildcat staff allowlist.
