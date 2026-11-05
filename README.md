# Steam Library Exporter

A Firefox-first browser extension for exporting Steam game libraries to TXT, CSV, and JSON.

The primary use case is exporting the signed-in user's own library, including libraries that are not publicly visible. Exporting another user's library is a secondary capability and is limited to information Steam makes publicly accessible.

## Project status

Early investigation / prototype planning. Steam's authenticated endpoints are not yet treated as stable or complete APIs.

## Goals

- Export the current user's library without requiring a public Steam profile.
- Optionally export another user's library when Steam exposes it publicly.
- Keep all library processing local to the browser.
- Avoid collecting, persisting, or transmitting Steam credentials and session secrets.
- Produce transparent results: incomplete or unavailable data must never be presented as a complete library.
- Support TXT, CSV, and JSON exports.

## Development

Requirements: Node.js LTS and npm.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Security and privacy

The extension will request only the Steam host permissions needed for verified functionality. Session identifiers and authentication cookies must never be logged, exported, stored in extension storage, or sent to any third party. See [SECURITY.md](SECURITY.md).

## Architecture decisions

See [docs/architecture/](docs/architecture/) for the evolving design and investigation records.

## License

MIT. See [LICENSE](LICENSE).
