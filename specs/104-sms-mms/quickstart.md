# R24 local quickstart

1. Start the disposable PostgreSQL test database already owned by the campaign.
2. Apply all forward-only migrations with Prisma migrate.
3. Run the R24 contract tests, then the R24 PostgreSQL tests.
4. Run the R4 and selected action/evidence regressions.
5. Run the shared mobile tests and static/build gates.

Expected outcome: one provider-neutral SMS/MMS cockpit with durable consent,
opt-out, project routing, selected evidence and synthetic delivery state. Every
result reports zero external transport.

