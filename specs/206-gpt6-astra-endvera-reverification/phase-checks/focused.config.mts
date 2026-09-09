import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['specs/206-gpt6-astra-endvera-reverification/phase-checks/focused.test.ts'] } });
