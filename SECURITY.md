# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature where available. Do not publish credentials, session identifiers, cookies, or personal library data in public issues.

## Security requirements

- Steam authentication material must remain inside the browser's authorized request context.
- Session IDs and cookies must not be persisted, logged, exported, or transmitted to third parties.
- Permissions must be minimal and justified.
- Network responses must be validated before use.
- No remote executable code, telemetry, or backend collection.
- Export files contain user library information and are created only after an explicit user action.

This project is experimental. Do not assume that undocumented Steam endpoints provide stable guarantees.
