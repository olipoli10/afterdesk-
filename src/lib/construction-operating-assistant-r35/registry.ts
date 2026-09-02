import environmentContractJson from "../../../release/endvera-construction-v1/environment-contract.json";
import releaseDefinitionJson from "../../../release/endvera-construction-v1/release-definition.json";
import englishListingJson from "../../../release/endvera-construction-v1/store/en-CA.json";
import frenchListingJson from "../../../release/endvera-construction-v1/store/fr-CA.json";
import { releaseBoundarySchema, storeListingSchema } from "./contracts";

export const RELEASE_PACKAGE_VERSION = 1 as const;
export const RELEASE_TARGETS = ["WEB", "IOS", "ANDROID"] as const;
export const RELEASE_MODES = ["LOCAL_INTERNAL", "EXTERNAL_RELEASE"] as const;
export const RELEASE_READINESS_CEILING = "LOCAL_PACKAGE_READY" as const;
export const RELEASE_PUBLIC_PATHS = {
  privacy: "/privacy",
  security: "/security",
  support: "/construction/support",
  accountDeletion: "/client/privacy",
} as const;
export const RELEASE_BOUNDARY = releaseBoundarySchema.parse(releaseDefinitionJson.boundary);
export const RELEASE_LISTINGS = {
  "fr-CA": storeListingSchema.parse(frenchListingJson),
  "en-CA": storeListingSchema.parse(englishListingJson),
} as const;

export function assertReleaseRegistryHonest(): void {
  if (releaseDefinitionJson.readinessCeiling !== RELEASE_READINESS_CEILING) throw new Error("RELEASE_READINESS_INFLATION_REFUSED");
  if (JSON.stringify(releaseDefinitionJson.targets) !== JSON.stringify(RELEASE_TARGETS)) throw new Error("RELEASE_TARGETS_MISMATCH");
  if (environmentContractJson.secretValuesSerializable !== false || environmentContractJson.localProviderValuesAllowed !== false || environmentContractJson.externalReleaseAuthorized !== false) {
    throw new Error("RELEASE_ENVIRONMENT_BOUNDARY_INVALID");
  }
  const french = RELEASE_LISTINGS["fr-CA"];
  const english = RELEASE_LISTINGS["en-CA"];
  if (JSON.stringify(french.capabilityCodes) !== JSON.stringify(english.capabilityCodes) || JSON.stringify(french.unavailableCapabilityCodes) !== JSON.stringify(english.unavailableCapabilityCodes)) {
    throw new Error("RELEASE_LOCALE_PARITY_MISMATCH");
  }
}

export const releaseDefinition = releaseDefinitionJson;
export const releaseEnvironmentContract = environmentContractJson;
