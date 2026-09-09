import ts from 'typescript';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { assertReleaseRegularFile } from './endvera-release-source-binding.mjs';

const canonicalPublicRouteImplementations = Object.freeze({
 privacy:'src/app/privacy/page.tsx',security:'src/app/security/page.tsx',support:'src/app/construction/support/page.tsx',accountDeletion:'src/app/account-deletion/page.tsx',
});
export const publicRouteImplementations = Object.freeze({...canonicalPublicRouteImplementations});
const expectedPublicPaths={privacy:'/privacy',security:'/security',support:'/construction/support',accountDeletion:'/account-deletion'};
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
function literal(node){
 while(ts.isAsExpression(node)||ts.isParenthesizedExpression(node)||ts.isSatisfiesExpression(node))node=node.expression;
 if(ts.isStringLiteral(node)||ts.isNumericLiteral(node))return ts.isNumericLiteral(node)?Number(node.text):node.text;
 if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
 if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(node.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(property=>{
  if(!ts.isPropertyAssignment(property)||!property.name||!ts.isIdentifier(property.name)&&!ts.isStringLiteral(property.name))throw new Error('RELEASE_MOBILE_METADATA_NOT_LITERAL');
  return [property.name.text,literal(property.initializer)];
 }));
 throw new Error('RELEASE_MOBILE_METADATA_NOT_LITERAL');
}
export function validateMobileReleaseMetadata(source,definition){
 const ast=ts.createSourceFile('release.ts',source,ts.ScriptTarget.Latest,false);
 if(ast.parseDiagnostics.length)throw new Error('RELEASE_MOBILE_METADATA_SYNTAX_INVALID');
 // Closed two-statement source contract, not general JavaScript interpretation.
 // No imports, aliases, extra statements or post-declaration mutations allowed.
 const [metadataStatement,labelStatement]=ast.statements;
 if(ast.statements.length!==2||!metadataStatement||!ts.isVariableStatement(metadataStatement)||!(metadataStatement.declarationList.flags&ts.NodeFlags.Const)||metadataStatement.declarationList.declarations.length!==1||!labelStatement||!ts.isFunctionDeclaration(labelStatement))throw new Error('RELEASE_MOBILE_METADATA_MODULE_SHAPE_INVALID');
 const expectedLabel=ts.createSourceFile('label.ts','export function mobileReleaseLabel(platform: "ios" | "android") { return platform === "ios" ? `${MOBILE_RELEASE_INFO.semanticVersion} (${MOBILE_RELEASE_INFO.ios.buildNumber})` : `${MOBILE_RELEASE_INFO.semanticVersion} (${MOBILE_RELEASE_INFO.android.versionCode})`; }',ts.ScriptTarget.Latest,false);
 const nodeShape=node=>{const children=[];ts.forEachChild(node,child=>{children.push(nodeShape(child));});return [node.kind,typeof node.text==='string'?node.text:null,children];};
 if(JSON.stringify(nodeShape(labelStatement))!==JSON.stringify(nodeShape(expectedLabel.statements[0])))throw new Error('RELEASE_MOBILE_METADATA_LABEL_FUNCTION_INVALID');
 const declarations=ast.statements.filter(ts.isVariableStatement).filter(s=>s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).flatMap(s=>s.declarationList.declarations).filter(d=>ts.isIdentifier(d.name)&&d.name.text==='MOBILE_RELEASE_INFO');
 if(declarations.length!==1||!declarations[0].initializer)throw new Error('RELEASE_MOBILE_METADATA_EXPORT_INVALID');
 const actual=literal(declarations[0].initializer),ios=definition.identities.find(x=>x.target==='IOS'),android=definition.identities.find(x=>x.target==='ANDROID');
 const expected={schemaVersion:definition.schemaVersion,productName:definition.productName,semanticVersion:ios.semanticVersion,ios:{bundleIdentifier:ios.bundleIdentifier,buildNumber:ios.buildNumber},android:{package:android.package,versionCode:android.versionCode},publicPaths:definition.publicPaths,buildPreparation:{status:'READY_FOR_SIGNING_AUTHORITY',configPath:'apps/mobile/eas.json',readinessPath:'release/endvera-construction-v1/mobile-build-readiness.json'},readiness:definition.readinessCeiling,...definition.boundary};
 if(stable(actual)!==stable(expected))throw new Error('RELEASE_MOBILE_METADATA_MISMATCH');
 return actual;
}
export function collectPublicRouteInputs(repositoryRoot,definition,readFile=readFileSync){
 if(stable(definition.publicPaths)!==stable(expectedPublicPaths))throw new Error('RELEASE_PUBLIC_PATHS_MISMATCH');
 const pending=Object.values(canonicalPublicRouteImplementations),visited=new Set();
 while(pending.length){
  const file=pending.pop();if(visited.has(file))continue;visited.add(file);
  let resolved;try{resolved=assertReleaseRegularFile(repositoryRoot,file);}catch(error){if(error.code==='ENOENT')throw new Error('RELEASE_PUBLIC_ROUTE_INPUT_MISSING');throw error;}
  const source=readFile(resolved,'utf8');
  if(!/\.[cm]?[jt]sx?$/.test(file))continue;
  const ast=ts.createSourceFile(file,String(source),ts.ScriptTarget.Latest,false);
  if(Object.values(canonicalPublicRouteImplementations).includes(file)&&!ast.statements.some(s=>ts.isExportAssignment(s)||s.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)))throw new Error('RELEASE_PUBLIC_ROUTE_DEFAULT_EXPORT_MISSING');
  function add(specifier){
   if(!specifier.startsWith('@/')&&!specifier.startsWith('.'))return;
   const base=specifier.startsWith('@/')?`src/${specifier.slice(2)}`:path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
   const candidates=[base,...['.ts','.tsx','.js','.mjs','.cjs','.json','/index.ts','/index.tsx','/index.js'].map(ext=>base+ext)];
   const target=candidates.find(candidate=>{
    if(!existsSync(path.resolve(repositoryRoot,candidate)))return false;
    try{assertReleaseRegularFile(repositoryRoot,candidate);return true;}
    catch(error){if(error.code==='ENOTDIR'||error.message==='RELEASE_SOURCE_NONREGULAR_INPUT_REFUSED')return false;throw error;}
   });
   if(!target)throw new Error('RELEASE_PUBLIC_ROUTE_DEPENDENCY_MISSING');
   pending.push(target);
  }
  const visit=node=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))add(node.moduleSpecifier.text);if(ts.isCallExpression(node)&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))add(node.arguments[0].text);ts.forEachChild(node,visit);};visit(ast);
 }
 return [...visited].sort();
}
