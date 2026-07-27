# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report security vulnerabilities via [GitHub Security Advisories](https://github.com/kevin1chun/robinhood-for-agents/security/advisories/new) with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive an acknowledgment within 48 hours and a detailed response within 7 days.

## Scope

**In scope:**
- Token or credential leakage
- Weaknesses in token storage — OS keychain handling (`KeychainTokenStore`) or file encryption (`EncryptedFileTokenStore`)
- Unauthorized order execution or account access
- Bypassing safety controls (blocked operations, parameter validation)

**Out of scope:**
- Vulnerabilities in the Robinhood API itself
- Issues requiring physical access to the user's machine
- Social engineering

## Security Design

This project follows a defense-in-depth approach:

- Tokens stored in the OS keychain via `Bun.secrets` (default), or in an AES-256-GCM encrypted file for Docker/headless deployments — never in plaintext on disk
- Fund transfers and bank operations are permanently blocked
- Bulk cancel operations are blocked
- All order placements require explicit parameters with no dangerous defaults
- Access-token lifetime varies (~6–8.5 days observed) and tokens auto-refresh via the stored refresh token — proactively ~24h before expiry, and on a 401 as a fallback. Refresh tokens are single-use: each renewal issues a new one and immediately invalidates the old, so re-running browser login revokes any previously copied token family

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model and [docs/ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the risk tiers.
