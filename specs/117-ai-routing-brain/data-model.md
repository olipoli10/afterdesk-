# Logical Data Model: R36A AI Routing Brain

R36A adds no database table. The following immutable logical values are designed
to map onto the existing Model Gateway persistence in R37.

## AssistantRoutingRequest

- schemaVersion, requestId, workspaceId, channel, normalizedIntent
- subjectKind, dataClass, privacyRequirement, riskClass
- maxCostMicros, requestFingerprint

## CapabilityDefinition

- capabilityKey, version, resultKind, externality, approvalClass
- citationsRequired, allowedDataClasses, resolutionOwner

## RouteCandidate

- routeKey, version, capabilityKey, pathKind
- providerFamily, candidateOnly, enabled
- privacyPosture, allowedDataClasses, maxCostMicros
- availability, evidenceState, breakerState

## RoutingPolicy

- policyKey, version, status, capabilityKey
- orderedRoutePins, fallbackPins, policyHash

## RoutingDecision

- disposition, reasonCode, capabilityKey
- selectedRoutePin, fallbackPins, approvalRequired
- citationsRequired, providerExecutionAuthorized
- requestFingerprint, policyHash, routeHash, decisionFingerprint

## HumanHandoffPlan

- capabilityKey, boundedContextRef, expectedOutputContract
- verificationCriteria, resumePoint, costCeilingMicros

