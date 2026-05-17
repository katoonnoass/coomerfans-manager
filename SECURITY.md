# Security Policy

## Supported Versions

The default branch is the only supported development line until formal releases are published.

## Reporting a Vulnerability

Open a private security advisory on GitHub if available, or contact the maintainers privately. Do not publish:

- JWT secrets
- `.env` files
- Database dumps
- Download proxy tokens
- Logs containing private paths or URLs
- Media files or third-party content

## Security Notes

- Generated IDM import URLs contain signed local proxy tokens.
- Keep the backend local unless you understand the network exposure.
- Rotate JWT secrets before using a shared or public deployment.
- Do not commit runtime media, logs, or import files.
