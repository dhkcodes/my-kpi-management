# Oracle JET Project Rules

- Use Oracle JET Virtual DOM architecture.
- Use TypeScript and TSX.
- Prefer Preact-compatible component patterns.
- Prefer Oracle JET Core Pack (`oj-c-*`) components where the exact API is known.
- Use Redwood theme as the default visual baseline.
- Use `npx ojet build` for build verification; do not assume `npm run build` exists.
- Do not mix old Knockout MVVM examples into VDOM screens unless explicitly requested.
- Check Oracle JET component API/Cookbook before inventing props, events, or slots.
- Keep initial development mock-data-only; do not connect real OCI APIs, credentials, IAM, or paid resources without explicit approval.
