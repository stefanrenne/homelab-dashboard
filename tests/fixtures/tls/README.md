Throwaway certificates, only for tests. Not used anywhere else.

- `localhost.crt`/`localhost.key`: self-signed for localhost (tests/runtime.test.mjs, ctx.fetch
  with insecure: true).
- `ca.crt` (its key was thrown away), `server.crt`/`server.key` (localhost, signed by that CA)
  and `client.crt`/`client.key` (a client certificate from the same CA): Docker over TLS, a
  daemon that checks the client (tests/discovery.test.mjs, tests/runtime.test.mjs).
