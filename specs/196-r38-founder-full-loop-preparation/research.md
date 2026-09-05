# Research decisions

## Reuse the economic loop

The current repository contains the same R0 evaluator contracts as the earlier founder invoice-readiness lane. Reusing that deterministic engine avoids inventing a second readiness definition.

## Direct local access

A short-lived one-time loopback token creates the synthetic authenticated session. This removes the login page and password copying while preserving server-side authorization.

## No provider in R38 preflight

R37 did not select a valid controller candidate and both observed attempts remain REWORK. R38 therefore exercises canonical local state and prepared actions only. A provider call would be a separate authority and cannot be inherited from `GO`.

## Human/technical evidence split

PostgreSQL supplies counts, hashes, transition facts and external-effect totals. Olivier supplies only clarity, actionability, confidence, correction/context repetition counts, willingness to use, and free text.
