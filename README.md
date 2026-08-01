# my-kpi-management

Oracle JET VDOM + TypeScript scaffold for an FY26 KPI operating cockpit.

## Stack

- Oracle JET `~20.1.0`
- Oracle JET Core Pack `~20.1.0`
- Oracle JET CLI `~20.1.2`
- TypeScript `5.8.3`
- Default theme: Redwood (`oraclejetconfig.json` -> `defaultTheme: "redwood"`)

## Run

```bash
npm install
npx ojet build
npx ojet serve
```

## Current MVP Scope

- Responsive side navigation
- Redwood-aligned top header
- KPI Operating Cockpit dashboard
- FY26 mock KPI definitions, status snapshots, and recent activity data
- Static UI only; no backend, real OCI API, credentials, or paid resource integration
