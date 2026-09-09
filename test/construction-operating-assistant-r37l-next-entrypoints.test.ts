import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {describe,expect,it} from "vitest";
import {findProviderExecutionReachability,findUnresolvedDynamicModuleReachability,findDynamicCodeExecutionReachability} from "@/lib/construction-operating-assistant-r37l/provider-reachability";
import {validateProviderBoundaryModules} from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const provider="src/server/construction-operating-assistant-r37f/provider-delivery.ts";
const entrypoints=["src/app/api/hello/route.ts","app/api/hello/route.ts","app/page.tsx","src/pages/api/hello.ts","pages/api/hello.js","src/pages/index.tsx","pages/_app.jsx","src/middleware.ts","middleware.js","src/proxy.ts","proxy.js","src/instrumentation.ts","instrumentation.js","src/instrumentation-client.ts","instrumentation-client.js","src/jobs/task.ts","src/workers/task.ts","src/server/actions/task.ts"];

describe("R37L Next executable entrypoint boundary",()=>{
  it.each(entrypoints)("finds direct and transitive provider exposure at %s",entrypoint=>{
    const modules=new Map([[entrypoint,'import "@/server/facade";'],["src/server/facade.ts",'export * from "./construction-operating-assistant-r37f/provider-delivery";'],[provider,"export const safeFixture=true;"]]);
    expect(findProviderExecutionReachability(modules)).toEqual([{entrypoint,path:[entrypoint,"src/server/facade.ts",provider]}]);
    modules.set(entrypoint,'requestObservedProviderExecution();');
    expect(validateProviderBoundaryModules(modules)).toContainEqual({code:"R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED",path:entrypoint});
  });
  it.each(entrypoints)("finds computed loaders and dynamic code at %s",entrypoint=>{
    const modules=new Map([[entrypoint,'const target = input; import(target); eval(input);']]);
    expect(findUnresolvedDynamicModuleReachability(modules)).toEqual([{entrypoint,path:[entrypoint],unresolvedModule:entrypoint,callKind:"import"}]);
    expect(findDynamicCodeExecutionReachability(modules)).toEqual([{entrypoint,path:[entrypoint],executionModule:entrypoint,executionKind:"eval"}]);
  });
  it("normalizes Windows paths and retains private/nonconvention controls",()=>{
    expect(findDynamicCodeExecutionReachability(new Map([[".\\src\\proxy.ts","eval(input)"]]))[0]?.entrypoint).toBe("src/proxy.ts");
    for(const path of ["src/lib/proxy.ts","proxy-helper.ts","src/middleware-helper.ts","private/instrumentation.ts","src/proxy.ts.backup"])expect(findDynamicCodeExecutionReachability(new Map([[path,"eval(input)"]]))).toEqual([]);
    for(const entrypoint of entrypoints)expect(validateProviderBoundaryModules(new Map([[entrypoint,"export const ordinary=true;"]]))).toEqual([]);
  });
  it("the CLI inventories root Next entries and their non-src facade instead of reporting false green",()=>{
    const root=process.cwd();const fixture=mkdtempSync(join(tmpdir(),"endvera206-next-entrypoints-"));
    try {
      for(const [path,source] of [["src/private.ts","export const ordinary=true;"],["pages/api/send.ts",'import "../../custom/coverage/facade";'],["custom/coverage/facade.ts",'export * from "../../src/server/construction-operating-assistant-r37f/provider-delivery";'],[provider,"export const fixture=true;"]]){const absolute=join(fixture,path);mkdirSync(dirname(absolute),{recursive:true});writeFileSync(absolute,source);}
      const result=spawnSync(process.execPath,[resolve(root,"node_modules/tsx/dist/cli.mjs"),"--tsconfig",resolve(root,"tsconfig.json"),resolve(root,"scripts/validate-provider-boundary.ts")],{cwd:fixture,encoding:"utf8",windowsHide:true,timeout:20000});
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED pages/api/send.ts");
      expect(result.stdout).not.toContain("R37O_PROVIDER_BOUNDARY_PASS");
      writeFileSync(join(fixture,"pages/api/send.ts"),"export default function handler(){};");
      expect(execFileSync(process.execPath,[resolve(root,"node_modules/tsx/dist/cli.mjs"),"--tsconfig",resolve(root,"tsconfig.json"),resolve(root,"scripts/validate-provider-boundary.ts")],{cwd:fixture,encoding:"utf8",windowsHide:true,timeout:20000})).toContain("R37O_PROVIDER_BOUNDARY_PASS");
    } finally {rmSync(fixture,{recursive:true,force:true});}
  });
});
