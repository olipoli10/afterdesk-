export type DeterministicProviderFixture<T> =
  | { kind: "response"; value: T }
  | { kind: "error"; error: Error };

export function createCountingProvider<T>(fixtures: readonly DeterministicProviderFixture<T>[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async dispatch(): Promise<T> {
      const fixture = fixtures[calls++];
      if (!fixture) throw new Error(`UNEXPECTED_PROVIDER_CALL:${calls}`);
      if (fixture.kind === "error") throw fixture.error;
      return fixture.value;
    },
    assertExhausted() {
      if (calls !== fixtures.length) {
        throw new Error(`UNUSED_PROVIDER_FIXTURES:${fixtures.length - calls}`);
      }
    },
  };
}
