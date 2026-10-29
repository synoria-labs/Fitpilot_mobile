# Session persistence regression

Refresh responses carry a session generation check so a request started before logout cannot restore old credentials. SecureStore writes and deletes are serialized to preserve their order.

```sh
node scripts/test-session-security.cjs
```

This runs the actual API module with simulated Axios, SecureStore, connectivity and Expo configuration. It delays refresh until after logout and verifies that memory and SecureStore remain empty. It needs the project's TypeScript dependency, and uses no emulator, database or external API.
