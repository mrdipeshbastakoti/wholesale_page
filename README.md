# Wildcat Brewing Wholesale Manager

Internal wholesale order management system for Wildcat Brewing.

## Current features

- Dynamic wholesale order dashboard
- Can / box and keg orders
- Multiple beers in one customer order
- Priority: Low, Normal, High, Urgent
- Workflow: Not Started → Preparing → Ready → Out for Delivery → Delivered
- On-hold and cancelled order handling
- Automatic beer-to-prepare totals
- Add, edit, archive and restore beers
- Add and edit wholesale customers
- Unit price per box / keg and automatic order totals
- Sales dashboard: all-time, this month, last 30 days and this year
- Total boxes, cans, kegs, liters, delivered orders and recorded revenue
- Sales by beer and by customer
- Delivered order history
- CSV sales export
- Search orders and customers
- Mobile-friendly layout
- Supabase authentication, Row Level Security and realtime updates

## Hosting

GitHub Pages from the `main` branch, root folder.

## Security

The frontend contains only the Supabase publishable browser key. Wholesale business data is protected by Supabase Row Level Security and the Wildcat staff allowlist.
