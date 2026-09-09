import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const currentProjectionPath='release/current-projection-v3.json';
const canonicalHistoricalPaths=Object.freeze([
 'release/endvera-construction-v1/whole-product-readiness.json',
 'release/endvera-construction-v1/whole-product-closure-audit.json',
 'release/endvera-construction-v1/market-readiness-report.json',
]);
const canonicalCurrentInputPaths=Object.freeze([
 'release/endvera-construction-v1/release-definition-v3.json',
 'apps/mobile/app.json','apps/mobile/package.json',
 'src/app/account-deletion/page.tsx',
 'release/endvera-construction-v1/environment-contract-v2.json',
]);
// Consumers cannot redefine either internal canonical set by mutating exports.
export const historicalPaths=Object.freeze([...canonicalHistoricalPaths]);
export const currentInputPaths=Object.freeze([...canonicalCurrentInputPaths]);
const sha=value=>createHash('sha256').update(value).digest('hex');
// Reviewed fixed archive metadata, including original commit/blob and checkout
// digests. Regenerating the adjacent index cannot redefine historical truth.
const historicalArchiveAnchor='20f62c81d57d1686e394ba6fd5fb4764c004efd1374c4f58b0aaf0aab68c0254';
const fail=(condition,code)=>{if(!condition)throw new Error(code);};
export function requireExactInputs(inputs,expected,code) {
 fail(Array.isArray(inputs)&&inputs.length===expected.length&&inputs.every(x=>x&&typeof x.path==='string')&&new Set(inputs.map(x=>x.path)).size===expected.length&&JSON.stringify(inputs.map(x=>x.path).sort())===JSON.stringify([...expected].sort()),code);
}
export function buildCurrentProjection({root=repositoryRoot,readFile=readFileSync}={}) {
 const read=path=>readFile(resolve(root,path));
 const json=path=>JSON.parse(read(path).toString('utf8'));
 const definition=json(canonicalCurrentInputPaths[0]);const app=json(canonicalCurrentInputPaths[1]).expo;const pkg=json(canonicalCurrentInputPaths[2]);
 const env=json(canonicalCurrentInputPaths[4]);
 const identities=definition.identities??[];
 fail(identities.length===3&&new Set(identities.map(x=>x.target)).size===3,'CURRENT_IDENTITY_SET_INVALID');
 const ios=identities.find(x=>x.target==='IOS');const android=identities.find(x=>x.target==='ANDROID');
 fail(ios&&android&&identities.some(x=>x.target==='WEB'),'CURRENT_IDENTITY_SET_INVALID');
 fail(app&&app.version===pkg.version&&app.version===ios.semanticVersion&&app.version===android.semanticVersion&&app.ios?.bundleIdentifier===ios.bundleIdentifier&&app.ios?.buildNumber===ios.buildNumber&&app.android?.package===android.package&&app.android?.versionCode===android.versionCode&&app.scheme===ios.scheme&&app.scheme===android.scheme,'CURRENT_CONFIG_IDENTITY_MISMATCH');
 fail(definition.publicPaths?.accountDeletion==='/account-deletion'&&read(canonicalCurrentInputPaths[3]).length>0,'CURRENT_ACCOUNT_DELETION_CONFIG_INVALID');
 fail(env.secretValuesSerializable===false&&env.externalReleaseAuthorized===false&&Array.isArray(env.variables)&&env.variables.every(variable=>!Object.hasOwn(variable,'value')),'CURRENT_ENVIRONMENT_AUTHORITY_INVALID');
 const archive=json('release/current-projection-v3.history.json');
 fail(sha(Buffer.from(JSON.stringify(archive)))===historicalArchiveAnchor,'HISTORICAL_ARCHIVE_ANCHOR_MISMATCH');
 requireExactInputs(archive.entries,canonicalHistoricalPaths,'HISTORICAL_ATTESTATION_SET_INVALID');
 for(const item of archive.entries)fail(sha(read(item.path))===item.checkoutSha256,`HISTORICAL_ATTESTATION_BYTES_CHANGED:${item.path}`);
 return {
  schemaVersion:3,kind:'CURRENT_CONFIGURATION_PROJECTION',status:'CURRENT_CONFIGURATION_COHERENCE_ONLY',
  scope:'EXACT_SOURCE_BYTES_AND_MOBILE_RELEASE_CONFIGURATION',
  currentInputs:canonicalCurrentInputPaths.map(path=>({path,sha256:sha(read(path))})),
  historyManifest:{path:'release/current-projection-v3.history.json',sha256:sha(read('release/current-projection-v3.history.json'))},
  supersedes:canonicalHistoricalPaths.map(path=>({path,applicationToCurrentBuild:'NOT_APPLICABLE_HISTORICAL_ONLY'})),
  mobileConfiguration:{semanticVersion:app.version,iosBuildNumber:app.ios.buildNumber,androidVersionCode:app.android.versionCode,accountDeletionPath:definition.publicPaths.accountDeletion},
  evidenceClass:'STATIC_SOURCE_CONFIGURATION_ONLY',observedProof:null,
  wholeProductReadiness:'NOT_EVALUATED',wholeProductClosure:'NOT_EVALUATED',externalReadiness:'NOT_EVALUATED',
  providerCustomerTestDecision:'NO-GO',productionReady:false,deviceObserved:false,
 };
}
export function validateCurrentProjection(value,options={}) {
 fail(options&&Object.keys(options).length===0,'CURRENT_VALIDATION_READER_OVERRIDE_REFUSED');
 requireExactInputs(value?.currentInputs,canonicalCurrentInputPaths,'CURRENT_PROJECTION_INPUT_SET_INVALID');
 const actual=buildCurrentProjection();
 for(let index=0;index<actual.currentInputs.length;index++) {
  const expected=actual.currentInputs[index];const supplied=value.currentInputs.find(x=>x.path===expected.path);
  fail(supplied.sha256===expected.sha256,`CURRENT_PROJECTION_INPUT_HASH_MISMATCH:${expected.path}`);
 }
 fail(JSON.stringify(value)===JSON.stringify(actual),'CURRENT_PROJECTION_CLAIM_OR_BINDING_MISMATCH');
 return {status:actual.status,evidenceClass:actual.evidenceClass,wholeProductReadiness:'NOT_EVALUATED',wholeProductClosure:'NOT_EVALUATED',externalReadiness:'NOT_EVALUATED',providerCustomerTestDecision:'NO-GO',currentInputCount:actual.currentInputs.length};
}
export function readCurrentProjection(root=repositoryRoot) {
 fail(resolve(root)===repositoryRoot,'CURRENT_VALIDATION_ROOT_OVERRIDE_REFUSED');
 return validateCurrentProjection(JSON.parse(readFileSync(resolve(repositoryRoot,currentProjectionPath),'utf8')));
}
