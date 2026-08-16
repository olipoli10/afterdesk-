/* next/experimental/testing/server expects Next's server bootstrap to have
   installed AsyncLocalStorage on globalThis; vitest's node runtime does
   not. Import this module FIRST. */
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage ??= AsyncLocalStorage;
