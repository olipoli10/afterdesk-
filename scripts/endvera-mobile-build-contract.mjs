export function validateMobileBuildPreparation(app,eas,readiness) {
 const profiles=['founder-device','internal-preview','local-simulator','store-candidate'];
 if(JSON.stringify(Object.keys(eas.build??{}).sort())!==JSON.stringify(profiles))throw new Error('MOBILE_BUILD_PROFILE_SET_MISMATCH');
 if('submit' in eas)throw new Error('MOBILE_BUILD_SUBMIT_PATH_REFUSED');
 if(!Array.isArray(readiness.profiles)||JSON.stringify([...readiness.profiles].sort())!==JSON.stringify(profiles))throw new Error('MOBILE_READINESS_PROFILE_SET_MISMATCH');
 if(eas.build['founder-device']?.distribution!=='internal'||eas.build['founder-device']?.android?.buildType!=='apk'||eas.build['founder-device']?.autoIncrement!==false)throw new Error('MOBILE_FOUNDER_PROFILE_INVALID');
 const local=eas.build['local-simulator'],store=eas.build['store-candidate'];
 if(eas.cli?.appVersionSource!=='local'||eas.cli?.requireCommit!==true||local.distribution!=='internal'||local.autoIncrement!==false||local.ios?.simulator!==true||local.android?.withoutCredentials!==true||local.android?.buildType!=='apk'||Object.keys(eas.build['internal-preview']).length!==1||eas.build['internal-preview'].extends!=='local-simulator'||store.distribution!=='store'||store.autoIncrement!==false||store.ios?.simulator!==false||store.android?.buildType!=='app-bundle'||eas.build['founder-device'].ios?.simulator!==false)throw new Error('MOBILE_BUILD_PROFILE_SEMANTICS_INVALID');
 if(JSON.stringify(eas).match(/"(?:credentials|credentialsSource|projectId|owner|channel|environment|token|secret|password)"\s*:/iu))throw new Error('MOBILE_BUILD_VALUE_MATERIAL_REFUSED');
 if(app.ios?.bundleIdentifier!==readiness.ios?.bundleIdentifier||app.ios?.buildNumber!==readiness.ios?.buildNumber||app.android?.package!==readiness.android?.package||app.android?.versionCode!==readiness.android?.versionCode)throw new Error('MOBILE_BUILD_IDENTITY_MISMATCH');
 if(readiness.configPath!=='apps/mobile/eas.json'||readiness.status!=='READY_FOR_SIGNING_AUTHORITY'||['signed','uploaded','submitted','published','deployed','providerObserved'].some(flag=>readiness[flag]!==false)||readiness.externalEffectCount!==0)throw new Error('MOBILE_BUILD_CLAIM_INFLATION_REFUSED');
 return {status:'READY_FOR_SIGNING_AUTHORITY',scope:'STATIC_JSON_VALIDATION_ONLY',externalEffectCount:0};
}
