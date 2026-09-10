# Acquisition has already been reviewed. This file performs no download, installation or PostgreSQL launch.
# Controller must read this script before invoking it. It is not a network sandbox.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PGVECTOR_BUILD_POWERSHELL7_REQUIRED' }
Add-Type -AssemblyName System.IO.Compression
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskInspection = Join-Path $taskRepo '.scratch\personal-msvc-inspection-e96ff70434b44156958620ac96e0c1e5'
$taskStoreArchive = Join-Path $taskRepo '.scratch\personal-msvc-inspection-9ec9decbdfb5472caad50da4b87ead64\msvc-crt-x64-store.vsix'
$taskPgArchive = Join-Path $taskRepo '.scratch\postgres-native-17.11-3\postgresql-17.11-3-windows-x64-binaries.zip'
$taskRoot = $null
$taskStage = 'PREFLIGHT'
$taskExit = 1
$taskLaunched = $false
$taskBuildResult = $null
$taskInputHashes = @{}
$taskOutputHashes = @{}
$taskExtracted = [long]0
$taskPaths = @{}
$taskCommit = '8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c'

function Assert-Plain([string]$Path) {
  for ($item = Get-Item -LiteralPath $Path; $null -ne $item;) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PGVECTOR_BUILD_REPARSE_REFUSED' }
    $item = if ($item -is [IO.FileInfo]) { $item.Directory } else { $item.Parent }
  }
}
function Assert-Hash([string]$Path,[string]$Expected,[string]$Algorithm='SHA256') {
  Assert-Plain $Path
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
  if ($actual -ne $Expected) { throw 'PGVECTOR_BUILD_INPUT_HASH_MISMATCH' }
  $script:taskInputHashes[$Path] = @{ algorithm=$Algorithm; hash=$actual }
}
# Extract from already pinned archives to fresh copies; never trust mutable extracted input files.
# Complete publisher archives/extracted originals and their notices remain untouched in inspectionRoot.
function Copy-PinnedArchivePrefix([string]$Archive,[string]$Prefix,[string]$Destination) {
  Assert-Plain $Archive
  $file = [IO.File]::OpenRead($Archive)
  $zip = $null
  try {
    # Recheck on the very same read-locked stream consumed by ZipArchive, not a prior pathname lookup.
    $pin=$taskInputHashes[$Archive]
    if (-not $pin) { throw 'PGVECTOR_BUILD_UNPINNED_ARCHIVE_REFUSED' }
    $digest=if($pin.algorithm -eq 'SHA512'){[Security.Cryptography.SHA512]::Create()}else{[Security.Cryptography.SHA256]::Create()}
    try { $actual=[Convert]::ToHexString($digest.ComputeHash($file)).ToLowerInvariant() } finally { $digest.Dispose() }
    if ($actual -ne $pin.hash) { throw 'PGVECTOR_BUILD_INPUT_HASH_MISMATCH' }
    $file.Position=0
    $zip=[IO.Compression.ZipArchive]::new($file,[IO.Compression.ZipArchiveMode]::Read)
    if ($zip.Entries.Count -gt 50000) { throw 'PGVECTOR_BUILD_ENTRY_BOUND' }
    $targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $count = 0
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\','/')
      $exactFile = -not $Prefix.EndsWith('/')
      if ($exactFile) { if ($name -ne $Prefix) { continue } }
      elseif (-not $name.StartsWith($Prefix,[StringComparison]::Ordinal)) { continue }
      $relative = if ($exactFile) { [IO.Path]::GetFileName($name) } else { $name.Substring($Prefix.Length).TrimEnd('/') }
      if (-not $relative) { continue }
      $parts = $relative.Split('/')
      if ($relative.StartsWith('/') -or $relative -match '[\x00-\x1f:<>"|?*]' -or ($parts | Where-Object { -not $_ -or $_ -in @('.','..') -or $_ -match '[. ]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)' })) { throw 'PGVECTOR_BUILD_ARCHIVE_PATH_REFUSED' }
      $mode = ($entry.ExternalAttributes -shr 16) -band 0xF000
      if ($mode -notin @(0,0x4000,0x8000) -or ($entry.ExternalAttributes -band 0x400)) { throw 'PGVECTOR_BUILD_ARCHIVE_LINK_REFUSED' }
      $target = [IO.Path]::GetFullPath((Join-Path $Destination $relative.Replace('/','\')))
      if (-not $target.StartsWith($Destination.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $targets.Add($target)) { throw 'PGVECTOR_BUILD_ARCHIVE_COLLISION' }
      if ($name.EndsWith('/')) { $null=[IO.Directory]::CreateDirectory($target); Assert-Plain $target; continue }
      if ($entry.Length -lt 0 -or $script:taskExtracted + $entry.Length -gt 1GB) { throw 'PGVECTOR_BUILD_EXTRACTION_BOUND' }
      $parent = [IO.Path]::GetDirectoryName($target)
      $null=[IO.Directory]::CreateDirectory($parent)
      Assert-Plain $parent
      $input=$entry.Open(); $output=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try {
        $buffer=[byte[]]::new(65536); $written=[long]0
        while (($read=$input.Read($buffer,0,$buffer.Length)) -gt 0) {
          $written+=$read; $script:taskExtracted+=$read
          if ($written -gt $entry.Length -or $script:taskExtracted -gt 1GB) { throw 'PGVECTOR_BUILD_EXTRACTION_BOUND' }
          $output.Write($buffer,0,$read)
        }
        if ($written -ne $entry.Length) { throw 'PGVECTOR_BUILD_ENTRY_LENGTH_MISMATCH' }
      } finally { $output.Dispose(); $input.Dispose() }
      $count++
    }
    if ($count -eq 0) { throw 'PGVECTOR_BUILD_ARCHIVE_PREFIX_MISSING' }
  } finally { if($zip){$zip.Dispose()}; $file.Dispose() }
}
function Save-BuildReceipt {
  if (-not $taskRoot) { return }
  $receipt=@{ stage=$taskStage; inspectionRoot=$taskInspection; buildRoot=$taskRoot; sourceCommit=$taskCommit; inputHashes=$taskInputHashes; outputHashes=$taskOutputHashes; paths=$taskPaths; extractedBytes=$taskExtracted; compilerLaunchAttempted=$taskLaunched; compilerLaunched=if($taskBuildResult){$true}elseif($taskLaunched){$null}else{$false}; buildResult=$taskBuildResult; deadlineMilliseconds=120000; attempts=if($taskLaunched){1}else{0}; downloadedBytes=0; runtimeModified=$false; postgresLaunched=$false; installerExecuted=$false; networkIsolationEnforced=$false; userLicenseAcceptanceSubmitted=$false }
  [IO.File]::WriteAllText((Join-Path $taskRoot 'build-receipt.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}

try {
  if ($taskRepo -ne 'C:\dev\endvera-astra-r03' -or -not $IsWindows) { throw 'PGVECTOR_BUILD_WORKSPACE_REFUSED' }
  Assert-Plain $taskInspection
  $taskPins=@{
    'msvc-crt-headers.vsix'='852382a9aa73502b7849c1bcadfb603ba7175c4e8b60e6aba03c7de711d4ece5'
    'msvc-crt-x64.vsix'='f01f701a7bcd9587a340898c851424f6a52bb913a70c185ff0d5bf0288c5831a'
    'msvc-tools-x64.vsix'='ee0baaa3a112d255f19f6c27dcc0ff6e496949eb9f1f37be0ac908c562a7076c'
    'msvc-tools-resources.vsix'='6e31f47833bfa585f56d55716a1ef081f1434f93ad77160eab49c6e193765832'
    'windows-sdk-cpp.nupkg'='32ab05b77d870414bff150cadd9d1294b16a5ad9b8c3066367c95a52a246470ea26e8a1b63b2d5ec26578f3b35c4fce16d93501241a9be277febe6a3b6d3bc4a'
    'windows-sdk-x64.nupkg'='77c0f6070fbc19889938747c2537420792255de9622323cdcbafc1737ed1e0721a377cf72f65cccbe6e2dab71722f47fee031f5bbbf82910e18292069ef280ea'
    'pgvector-source.zip'='bf0e885aeea36c555da5e0c68869d2282ed53020b4388202dae20368f4a9b5ae'
  }
  foreach ($pin in $taskPins.GetEnumerator()) { Assert-Hash (Join-Path $taskInspection $pin.Key) $pin.Value $(if($pin.Key.EndsWith('.nupkg')){'SHA512'}else{'SHA256'}) }
  Assert-Hash $taskStoreArchive '9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56'
  Assert-Hash $taskPgArchive '4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf'
  # nmake's reviewed recipe uses cmd's copy builtin. Empty environment does not disable registry AutoRun.
  foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)) {
    foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)) {
      $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,$view)
      $key=$base.OpenSubKey('Software\Microsoft\Command Processor',$false)
      try { if ($key -and -not [string]::IsNullOrWhiteSpace([string]$key.GetValue('AutoRun',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames))) { throw 'PGVECTOR_BUILD_CMD_AUTORUN_REFUSED' } }
      finally { if($key){$key.Dispose()};$base.Dispose() }
    }
  }
  $taskWindows=[Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
  $taskSystem=Join-Path $taskWindows 'System32'; $taskCmd=Join-Path $taskSystem 'cmd.exe'
  Assert-Plain $taskCmd
  if ((Get-AuthenticodeSignature -LiteralPath $taskCmd).Status -ne 'Valid') { throw 'PGVECTOR_BUILD_COMSPEC_SIGNATURE_REFUSED' }
  if (([IO.DriveInfo]::new([IO.Path]::GetPathRoot($taskRepo))).AvailableFreeSpace -lt 2GB) { throw 'PGVECTOR_BUILD_FREE_SPACE_REQUIRED' }
  $taskRoot=Join-Path $taskRepo ('.scratch\personal-pgvector-build-'+[Guid]::NewGuid().ToString('N'))
  $null=[IO.Directory]::CreateDirectory($taskRoot); Assert-Plain $taskRoot
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=[Security.AccessControl.DirectorySecurity]::new(); $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $taskRoot -AclObject $acl
  & git -C $taskRepo check-ignore --quiet -- $taskRoot
  if ($LASTEXITCODE -ne 0) { throw 'PGVECTOR_BUILD_SCRATCH_NOT_IGNORED' }
  $taskStage='COPY_PINNED_INPUTS'
  $taskPaths=@{ source=(Join-Path $taskRoot 'source'); toolbin=(Join-Path $taskRoot 'toolbin'); crtInclude=(Join-Path $taskRoot 'crt-include'); crtLib=(Join-Path $taskRoot 'crt-lib'); crtStoreLib=(Join-Path $taskRoot 'crt-store-lib'); sdkInclude=(Join-Path $taskRoot 'sdk-include'); sdkLib=(Join-Path $taskRoot 'sdk-lib'); pgSdk=(Join-Path $taskRoot 'pg-sdk'); temp=(Join-Path $taskRoot 'temp') }
  foreach ($path in $taskPaths.Values) { $null=[IO.Directory]::CreateDirectory($path) }
  $vc='Contents/VC/Tools/MSVC/14.44.35207/'
  Copy-PinnedArchivePrefix (Join-Path $taskInspection 'msvc-tools-x64.vsix') ($vc+'bin/Hostx64/x64/') $taskPaths.toolbin
  Copy-PinnedArchivePrefix (Join-Path $taskInspection 'msvc-tools-resources.vsix') ($vc+'bin/Hostx64/x64/1033/') (Join-Path $taskPaths.toolbin '1033')
  Copy-PinnedArchivePrefix (Join-Path $taskInspection 'msvc-crt-headers.vsix') ($vc+'include/') $taskPaths.crtInclude
  Copy-PinnedArchivePrefix (Join-Path $taskInspection 'msvc-crt-x64.vsix') ($vc+'lib/x64/') $taskPaths.crtLib
  Copy-PinnedArchivePrefix $taskStoreArchive ($vc+'lib/x64/') $taskPaths.crtStoreLib
  Assert-Hash (Join-Path $taskPaths.crtStoreLib 'oldnames.lib') '35bd82cfb02a0146ff9c0ca6bf7dbde61d49c6d4f3493befe584218c370ff41d'
  foreach ($part in @('ucrt','shared','um')) { Copy-PinnedArchivePrefix (Join-Path $taskInspection 'windows-sdk-cpp.nupkg') ('c/Include/10.0.26100.0/'+$part+'/') (Join-Path $taskPaths.sdkInclude $part) }
  foreach ($part in @('ucrt','um')) { Copy-PinnedArchivePrefix (Join-Path $taskInspection 'windows-sdk-x64.nupkg') ('c/'+$part+'/x64/') (Join-Path $taskPaths.sdkLib $part) }
  Copy-PinnedArchivePrefix (Join-Path $taskInspection 'pgvector-source.zip') ('pgvector-'+$taskCommit+'/') $taskPaths.source
  Copy-PinnedArchivePrefix $taskPgArchive 'pgsql/include/' (Join-Path $taskPaths.pgSdk 'include')
  # Single import library, never a PostgreSQL executable.
  Copy-PinnedArchivePrefix $taskPgArchive 'pgsql/lib/postgres.lib' (Join-Path $taskPaths.pgSdk 'lib')
  $taskStage='PREFLIGHT_TOOLS'
  $critical=@{ 'cl.exe'='88c8344236a27a6e727e0a8edc49aaa2690bdc7a9464b9d18cc7abe70a9f1c0d';'nmake.exe'='b05f089f67dba8df1d7cc38798b71e62a6ce8881b234dcfc80a657264597626c';'link.exe'='ca11e6c45debd34bf652dfe984c5360a531a005ed78bf72852330c9c2590cf0d' }
  foreach ($pin in $critical.GetEnumerator()) { Assert-Hash (Join-Path $taskPaths.toolbin $pin.Key) $pin.Value }
  foreach ($file in Get-ChildItem -LiteralPath $taskPaths.toolbin -File -Recurse | Where-Object { $_.Extension -in @('.exe','.dll') }) {
    if ((Get-AuthenticodeSignature -LiteralPath $file.FullName).Status -ne 'Valid') { throw 'PGVECTOR_BUILD_TOOL_SIGNATURE_REFUSED' }
  }
  foreach ($path in @((Join-Path $taskPaths.pgSdk 'include/server/postgres.h'),(Join-Path $taskPaths.pgSdk 'include/server/pg_config.h'),(Join-Path $taskPaths.pgSdk 'lib/postgres.lib'),(Join-Path $taskPaths.source 'Makefile.win'),(Join-Path $taskPaths.source 'LICENSE'))) { Assert-Plain $path }
  Assert-Hash (Join-Path $taskPaths.source 'Makefile.win') '79693ec8c97f437d584528e298b7d100fee4ce814b5bafc4b7d28a305dd03d10'
  Assert-Hash (Join-Path $taskPaths.source 'LICENSE') '6bba9ebeb73e27477463b05e5ef1bf303bccbddb3db9bbc95905d351604d6a87'
  $taskEnvironment=[Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
  $taskEnvironment['SystemRoot']=$taskWindows; $taskEnvironment['WINDIR']=$taskWindows; $taskEnvironment['ComSpec']=$taskCmd
  $taskEnvironment['PATH']=$taskPaths.toolbin+';'+$taskSystem
  $taskEnvironment['INCLUDE']=$taskPaths.crtInclude+';'+(Join-Path $taskPaths.sdkInclude 'ucrt')+';'+(Join-Path $taskPaths.sdkInclude 'shared')+';'+(Join-Path $taskPaths.sdkInclude 'um')
  $taskEnvironment['LIB']=$taskPaths.crtLib+';'+$taskPaths.crtStoreLib+';'+(Join-Path $taskPaths.sdkLib 'ucrt')+';'+(Join-Path $taskPaths.sdkLib 'um')
  $taskEnvironment['PGROOT']=$taskPaths.pgSdk; $taskEnvironment['TEMP']=$taskPaths.temp; $taskEnvironment['TMP']=$taskPaths.temp
  $taskEnvironment['PATHEXT']='.COM;.EXE;.BAT;.CMD'; $taskEnvironment['PROCESSOR_ARCHITECTURE']='AMD64'; $taskEnvironment['NUMBER_OF_PROCESSORS']='1'
  # Native job: start suspended, attach before any downloaded code can run, then resume.
  # The job forbids breakaway and kills all its descendants on disposal. No global process selection.
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class PgvectorOwnedBuild {
  [StructLayout(LayoutKind.Sequential)] struct SI { public int cb; public IntPtr reserved,desktop,title; public int x,y,xs,ys,xc,yc,fill,flags; public short show,reserved2; public IntPtr reservedPtr,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct SIX { public SI startup; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public int pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC { public long processTime,jobTime; public uint flags; public UIntPtr min,max; public uint activeLimit; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong r,w,o,rb,wb,ob; }
  [StructLayout(LayoutKind.Sequential)] struct EXT { public BASIC basic; public IO io; public UIntPtr pm,jm,peakp,peakj; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNT { public long u,k,pu,pk; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr a,string n);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j,int c,ref EXT x,uint s);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr j,int c,out ACCOUNT a,uint s,IntPtr r);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr j,uint c);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr p,uint c);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr h,uint m,uint f);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref UIntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref SIX si,out PI pi);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr t);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr p,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr p,out uint c);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public sealed class Result { public uint exitCode; public bool timedOut,treeStopped; public long elapsedMilliseconds; }
  public static Result Run(string exe,string cwd,string root,Dictionary<string,string> vars) {
    IntPtr job=IntPtr.Zero,env=IntPtr.Zero,attributes=IntPtr.Zero,handleList=IntPtr.Zero; PI pi=new PI(); bool assigned=false,attributesReady=false; var result=new Result(); IntPtr[] handles=Array.Empty<IntPtr>();
    using(var stdout=new FileStream(Path.Combine(root,"build.stdout.log"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))
    using(var stderr=new FileStream(Path.Combine(root,"build.stderr.log"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))
    using(var stdin=new FileStream(Path.Combine(root,"empty.stdin"),FileMode.CreateNew,FileAccess.ReadWrite,FileShare.Read)) {
      try {
        job=CreateJobObjectW(IntPtr.Zero,null); if(job==IntPtr.Zero) throw new Win32Exception();
        var limits=new EXT(); limits.basic.flags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, no breakaway.
        if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf<EXT>())) throw new Win32Exception();
        handles=new[]{stdin.SafeFileHandle.DangerousGetHandle(),stdout.SafeFileHandle.DangerousGetHandle(),stderr.SafeFileHandle.DangerousGetHandle()};
        foreach(var h in handles) if(!SetHandleInformation(h,1,1)) throw new Win32Exception();
        UIntPtr size=UIntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        if(size.ToUInt64()==0 || size.ToUInt64()>65536) throw new InvalidOperationException("PGVECTOR_BUILD_ATTRIBUTE_SIZE_REFUSED");
        attributes=Marshal.AllocHGlobal((int)size.ToUInt64());
        if(!InitializeProcThreadAttributeList(attributes,1,0,ref size)) throw new Win32Exception(); attributesReady=true;
        handleList=Marshal.AllocHGlobal(IntPtr.Size*handles.Length);
        for(int i=0;i<handles.Length;i++)Marshal.WriteIntPtr(handleList,i*IntPtr.Size,handles[i]);
        if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),handleList,new UIntPtr((uint)(IntPtr.Size*handles.Length)),IntPtr.Zero,IntPtr.Zero))throw new Win32Exception();
        string block=String.Join("\0",vars.OrderBy(x=>x.Key,StringComparer.OrdinalIgnoreCase).Select(x=>x.Key+"="+x.Value))+"\0\0";
        env=Marshal.StringToHGlobalUni(block);
        var si=new SIX(); si.startup.cb=Marshal.SizeOf<SIX>(); si.startup.flags=0x101; si.startup.show=0; si.startup.input=handles[0];si.startup.output=handles[1];si.startup.error=handles[2];si.attributes=attributes;
        string cl=Path.Combine(Path.GetDirectoryName(exe),"cl.exe");
        var command=new StringBuilder("\""+exe+"\" /NOLOGO /F Makefile.win all \"CC="+cl+"\"");
        if(!CreateProcessW(exe,command,IntPtr.Zero,IntPtr.Zero,true,0x08080404,env,cwd,ref si,out pi)) throw new Win32Exception();
        if(!AssignProcessToJobObject(job,pi.process)) throw new Win32Exception(); assigned=true;
        var watch=Stopwatch.StartNew(); if(ResumeThread(pi.thread)==UInt32.MaxValue) throw new Win32Exception();
        uint wait=WaitForSingleObject(pi.process,120000); if(wait!=0 && wait!=258) throw new Win32Exception();
        result.timedOut=wait==258;
        if(!result.timedOut && !GetExitCodeProcess(pi.process,out result.exitCode)) throw new Win32Exception();
        // Also clean descendants after successful nmake exit; no orphan compiler/telemetry daemon survives this job.
        if(!TerminateJobObject(job,result.timedOut?124u:0u)) throw new Win32Exception();
        var cleanup=Stopwatch.StartNew();
        while(cleanup.ElapsedMilliseconds<5000) {
          ACCOUNT account; if(!QueryInformationJobObject(job,1,out account,(uint)Marshal.SizeOf<ACCOUNT>(),IntPtr.Zero)) throw new Win32Exception();
          if(account.active==0){result.treeStopped=true;break;} System.Threading.Thread.Sleep(20);
        }
        result.elapsedMilliseconds=watch.ElapsedMilliseconds;
        if(!result.treeStopped) throw new InvalidOperationException("PGVECTOR_BUILD_TREE_CLEANUP_UNCERTAIN");
        return result;
      } finally {
        foreach(var h in handles)SetHandleInformation(h,1,0);
        if(attributesReady)DeleteProcThreadAttributeList(attributes); if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes); if(handleList!=IntPtr.Zero)Marshal.FreeHGlobal(handleList);
        if(pi.process!=IntPtr.Zero && !assigned) TerminateProcess(pi.process,125);
        if(job!=IntPtr.Zero){TerminateJobObject(job,125);CloseHandle(job);}
        if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread); if(pi.process!=IntPtr.Zero)CloseHandle(pi.process); if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);
      }
    }
  }
}
'@
  $taskStage='COMPILE_ONE_ATTEMPT'; Save-BuildReceipt
  $taskLaunched=$true
  $taskBuildResult=[PgvectorOwnedBuild]::Run((Join-Path $taskPaths.toolbin 'nmake.exe'),$taskPaths.source,$taskRoot,$taskEnvironment)
  if ($taskBuildResult.timedOut -or $taskBuildResult.exitCode -ne 0 -or -not $taskBuildResult.treeStopped) { throw 'PGVECTOR_BUILD_COMPILE_FAILED' }
  $taskStage='INSPECT_OUTPUT_BYTES'
  foreach ($relative in @('vector.dll','vector.control','sql/vector--0.8.6.sql')) {
    $file=Join-Path $taskPaths.source $relative; Assert-Plain $file
    $taskOutputHashes[$relative]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  if ((Get-Item -LiteralPath (Join-Path $taskPaths.source 'vector.dll')).Length -gt 20MB) { throw 'PGVECTOR_BUILD_OUTPUT_PE_INVALID' }
  $bytes=[IO.File]::ReadAllBytes((Join-Path $taskPaths.source 'vector.dll'))
  if ($bytes.Length -lt 64 -or $bytes.Length -gt 20MB -or [Text.Encoding]::ASCII.GetString($bytes,0,2) -ne 'MZ') { throw 'PGVECTOR_BUILD_OUTPUT_PE_INVALID' }
  $pe=[BitConverter]::ToInt32($bytes,60)
  if ($pe -lt 64 -or $pe+26 -gt $bytes.Length -or [Text.Encoding]::ASCII.GetString($bytes,$pe,4) -ne "PE`0`0" -or [BitConverter]::ToUInt16($bytes,$pe+4) -ne 0x8664) { throw 'PGVECTOR_BUILD_OUTPUT_ARCHITECTURE_REFUSED' }
  $taskStage='BUILT_NOT_LOADED_PENDING_IMPORT_REVIEW'; $taskExit=0
} catch {
  Write-Output ('PGVECTOR_BUILD_FAILURE stage='+$taskStage+' type='+$_.Exception.GetType().Name+' line='+$_.InvocationInfo.ScriptLineNumber)
  if ($_.Exception.Message -match '^PGVECTOR_BUILD_[A-Z0-9_]+$') { Write-Output $_.Exception.Message }
  $cause=$_.Exception
  for ($depth=0;$null -ne $cause -and $depth -lt 4;$depth++) {
    if ($cause -is [ComponentModel.Win32Exception]) { Write-Output ('PGVECTOR_BUILD_NATIVE_ERROR_CODE='+$cause.NativeErrorCode); break }
    $cause=$cause.InnerException
  }
} finally {
  Save-BuildReceipt
  if ($taskRoot) { Write-Output ('PGVECTOR_BUILD_RETAINED_ROOT='+$taskRoot) }
}
exit $taskExit
