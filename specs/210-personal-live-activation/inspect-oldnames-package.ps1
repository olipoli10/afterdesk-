# Windows PowerShell/.NET byte and OPC inspection only. No downloaded tool is executed.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InspectionRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName WindowsBase
$taskRoot=(Resolve-Path -LiteralPath $InspectionRoot).Path
if($taskRoot -notmatch '^C:\\dev\\endvera-astra-r03\\\.scratch\\personal-msvc-inspection-[a-f0-9]{32}$'){throw 'OLDNAMES_ROOT_REFUSED'}
function Assert-Plain([string]$Path) {
  for($item=Get-Item -LiteralPath $Path;$null -ne $item;){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'OLDNAMES_REPARSE_REFUSED'}
    $item=if($item -is [IO.FileInfo]){$item.Directory}else{$item.Parent}
  }
}
Assert-Plain $taskRoot
$taskArchive=Join-Path $taskRoot 'msvc-crt-x64-store.vsix'
Assert-Plain $taskArchive
$taskHash=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if($taskHash -ne '9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56'){throw 'OLDNAMES_ARCHIVE_HASH_REFUSED'}
$package=[IO.Packaging.Package]::Open($taskArchive,[IO.FileMode]::Open,[IO.FileAccess]::Read)
try {
  $manager=[IO.Packaging.PackageDigitalSignatureManager]::new($package)
  $verification=$manager.VerifySignatures($false).ToString()
  if(-not $manager.IsSigned -or $verification -ne 'Success'){throw 'OLDNAMES_OPC_SIGNATURE_REFUSED'}
  $signedManifest=@($manager.Signatures | Where-Object { @($_.SignedParts | ForEach-Object {$_.OriginalString}) -contains '/manifest.json' })
  if($signedManifest.Count -eq 0){throw 'OLDNAMES_MANIFEST_NOT_SIGNED'}
  # Read the manifest out of the signed, read-locked package itself rather than its mutable extracted copy.
  $stream=$package.GetPart([Uri]::new('/manifest.json',[UriKind]::Relative)).GetStream([IO.FileMode]::Open,[IO.FileAccess]::Read)
  $reader=[IO.StreamReader]::new($stream)
  try{$manifest=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
  if($manifest.id -ne 'Microsoft.VC.14.44.17.14.CRT.x64.Store.base' -or $manifest.version -ne '14.44.35226'){throw 'OLDNAMES_PACKAGE_ID_REFUSED'}
  $certificates=@($signedManifest | ForEach-Object {
    $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($_.Signer)
    $chain=[Security.Cryptography.X509Certificates.X509Chain]::new()
    try {
      $chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
      $valid=$chain.Build($cert)
      @{subject=$cert.Subject;issuer=$cert.Issuer;thumbprint=$cert.Thumbprint;notAfter=$cert.NotAfter.ToUniversalTime().ToString('o');localChainValidWithoutRevocation=$valid;chainStatus=@($chain.ChainStatus|ForEach-Object{$_.Status.ToString()})}
    }finally{$chain.Dispose();$cert.Dispose()}
  })
  $extracted=Join-Path $taskRoot 'msvc-crt-x64-store-complete'
  $baseline='C:\dev\endvera-astra-r03\.scratch\personal-msvc-inspection-e96ff70434b44156958620ac96e0c1e5'
  $files=[Collections.Generic.List[object]]::new();$collisions=[Collections.Generic.List[object]]::new();$oldnames=$null
  foreach($entry in $manifest.files){
    $relative=$entry.fileName.TrimStart('/').Replace('/','\')
    $target=[IO.Path]::GetFullPath((Join-Path $extracted $relative))
    if(-not $target.StartsWith($extracted+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'OLDNAMES_MANIFEST_PATH_REFUSED'}
    Assert-Plain $target
    $hash=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if($hash -ne $entry.sha256.ToLowerInvariant()){throw 'OLDNAMES_EXTRACTED_HASH_REFUSED'}
    $files.Add(@{path=$relative;sha256=$hash;bytes=(Get-Item -LiteralPath $target).Length})
    if($relative -ieq 'Contents\VC\Tools\MSVC\14.44.35207\lib\x64\oldnames.lib'){$oldnames=@{path=$target;sha256=$hash;bytes=(Get-Item -LiteralPath $target).Length}}
    foreach($baseName in @('msvc-crt-x64','msvc-crt-headers','msvc-tools-x64','msvc-tools-resources')){
      $other=Join-Path (Join-Path $baseline ($baseName+'-complete')) $relative
      if(Test-Path -LiteralPath $other -PathType Leaf){
        Assert-Plain $other
        $collisions.Add(@{path=$relative;baselinePackage=$baseName;sameHash=((Get-FileHash -LiteralPath $other -Algorithm SHA256).Hash.ToLowerInvariant() -eq $hash)})
      }
    }
  }
  if(-not $oldnames){throw 'OLDNAMES_EXPECTED_X64_FILE_ABSENT'}
  if($oldnames.bytes -gt 20MB){throw 'OLDNAMES_LIBRARY_SIZE_REFUSED'}
  $bytes=[IO.File]::ReadAllBytes($oldnames.path)
  if([Text.Encoding]::ASCII.GetString($bytes,0,8) -ne "!<arch>`n"){throw 'OLDNAMES_COFF_ARCHIVE_REFUSED'}
  $at=8;$members=0;$amd64=0;$machineUnspecified=0;$otherMachines=[Collections.Generic.List[int]]::new()
  while($at -lt $bytes.Length){
    if($members++ -gt 50000 -or $at+60 -gt $bytes.Length){throw 'OLDNAMES_COFF_MEMBER_BOUND'}
    $name=[Text.Encoding]::ASCII.GetString($bytes,$at,16).Trim()
    $sizeText=[Text.Encoding]::ASCII.GetString($bytes,$at+48,10).Trim()
    if($sizeText -notmatch '^\d+$' -or [Text.Encoding]::ASCII.GetString($bytes,$at+58,2) -ne "```n"){throw 'OLDNAMES_COFF_HEADER_REFUSED'}
    $length=[int]$sizeText;$data=$at+60
    if($length -lt 0 -or $data+$length -gt $bytes.Length){throw 'OLDNAMES_COFF_LENGTH_REFUSED'}
    if($name -notin @('/','//')){
      if($length -lt 8){throw 'OLDNAMES_COFF_OBJECT_REFUSED'}
      $machine=[BitConverter]::ToUInt16($bytes,$data)
      if($machine -eq 0 -and [BitConverter]::ToUInt16($bytes,$data+2) -eq 0xffff){$machine=[BitConverter]::ToUInt16($bytes,$data+6)}
      if($machine -eq 0x8664){$amd64++}
      elseif($machine -eq 0){
        # Microsoft PE/COFF defines Machine=0 as applicable to any machine, not AMD64 evidence.
        # The OLDNAMES alias objects have debug/symbol data but no executable/code sections.
        if($length -lt 20 -or [BitConverter]::ToUInt16($bytes,$data+16) -ne 0){throw 'OLDNAMES_UNSPECIFIED_COFF_REFUSED'}
        $sections=[BitConverter]::ToUInt16($bytes,$data+2)
        if($sections -eq 0 -or $sections -gt 96 -or 20+$sections*40 -gt $length){throw 'OLDNAMES_UNSPECIFIED_COFF_REFUSED'}
        for($section=0;$section -lt $sections;$section++){
          $flags=[BitConverter]::ToUInt32($bytes,$data+20+$section*40+36)
          if($flags -band 0x20000020){throw 'OLDNAMES_UNSPECIFIED_EXECUTABLE_REFUSED'}
        }
        $machineUnspecified++
      }else{$otherMachines.Add($machine)}
    }
    $at=$data+$length+($length%2)
  }
  if($at -ne $bytes.Length -or $amd64+$machineUnspecified -eq 0 -or $otherMachines.Count -gt 0){throw 'OLDNAMES_COFF_ARCHITECTURE_REFUSED'}
  $receipt=@{inspectedAt=[DateTime]::UtcNow.ToString('o');archive=$taskArchive;sha256=$taskHash;opcSignature=$verification;manifestSigned=$true;certificates=$certificates;catalogManifestIntegrityVerified=$false;manifestFileCount=$files.Count;files=@($files.ToArray());oldnames=$oldnames;coff=@{memberCount=$members;amd64Objects=$amd64;machineUnspecifiedNonExecutableObjects=$machineUnspecified;otherMachineCount=$otherMachines.Count;machineFormatSource='https://learn.microsoft.com/en-us/windows/win32/debug/pe-format'};collisions=@($collisions.ToArray());compilerExecuted=$false;postgresLaunched=$false;runtimeModified=$false;fullOriginalPackagePreserved=$true;userLicenseAcceptanceSubmitted=$false}
  [IO.File]::WriteAllText((Join-Path $taskRoot 'oldnames-inspection.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  [pscustomobject]$receipt | Select-Object -Property * -ExcludeProperty files | ConvertTo-Json -Depth 8
}finally{$package.Close()}
