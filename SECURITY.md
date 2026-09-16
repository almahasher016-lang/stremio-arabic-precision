# Security

Never commit provider API keys, tokens, `.env`, signing secrets, media filenames or subtitle files. Configure secrets via Railway or GitHub Actions secret management. Use a different signing key for this independent project; do not reuse the old site's admin token. Do not expose `/health` provider credentials.

Authenticated requests remain server-side; client download links are HMAC-protected and expire after 20 minutes. Outbound HTTP enforces HTTPS provider host allowlists and strips authentication on cross-host redirects. ZIP input is bounded and rejects encrypted files, unsupported methods and ambiguous season packs. Logs omit sensitive strings.

This implementation intentionally supports one Railway replica. Rate queues and active caches are process-local; adding replicas requires a coordinated cross-process quota system. Report vulnerabilities privately to the repository owner; do not publish working exploits or secrets in public issues.
