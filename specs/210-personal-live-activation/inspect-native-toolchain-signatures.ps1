[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InspectionRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Security
$taskRoot = (Resolve-Path -LiteralPath $InspectionRoot).Path
if ($taskRoot -notmatch '^C:\\dev\\endvera-astra-r03\\\.scratch\\personal-msvc-inspection-[a-f0-9]{32}$') { throw 'SIGNATURE_ROOT_REFUSED' }
$taskReports = [Collections.Generic.List[object]]::new()
function Certificate-Report($Certificate) {
  $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($Certificate)
  $chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
  try {
    $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    $valid = $chain.Build($cert)
    return @{ subject=$cert.Subject; issuer=$cert.Issuer; thumbprint=$cert.Thumbprint; notBefore=$cert.NotBefore.ToUniversalTime().ToString('o'); notAfter=$cert.NotAfter.ToUniversalTime().ToString('o'); localChainValidWithoutRevocation=$valid; chainStatus=@($chain.ChainStatus | ForEach-Object { $_.Status.ToString() }) }
  } finally { $chain.Dispose(); $cert.Dispose() }
}
foreach ($name in @('msvc-crt-headers','msvc-crt-x64','msvc-tools-x64','msvc-tools-resources')) {
  $file = Join-Path $taskRoot ($name+'.vsix')
  $package = [IO.Packaging.Package]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read)
  try {
    $manager = [IO.Packaging.PackageDigitalSignatureManager]::new($package)
    $result = $manager.VerifySignatures($false).ToString()
    $taskReports.Add(@{ package=$name; kind='OPC_XML_PACKAGE'; isSigned=$manager.IsSigned; verification=$result; certificates=@($manager.Signatures | ForEach-Object { Certificate-Report $_.Signer }) })
  } finally { $package.Close() }
}
foreach ($name in @('windows-sdk-cpp','windows-sdk-x64')) {
  $bytes = [IO.File]::ReadAllBytes((Join-Path $taskRoot ($name+'-complete\.signature.p7s')))
  $cms = [Security.Cryptography.Pkcs.SignedCms]::new()
  $cms.Decode($bytes)
  $cms.CheckSignature($true)
  $taskReports.Add(@{ package=$name; kind='NUGET_CMS_SIGNATURE'; cmsSignatureValid=$true; fullNuGetArchiveSignatureBindingVerified=$false; contentType=$cms.ContentInfo.ContentType.Value; certificates=@($cms.SignerInfos | ForEach-Object { Certificate-Report $_.Certificate }) })
}
$taskToolDir = Join-Path $taskRoot 'msvc-tools-x64-complete\Contents\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64'
$taskPeSignatures = @(Get-ChildItem -LiteralPath $taskToolDir -File | Where-Object { $_.Extension -in @('.exe','.dll') } | ForEach-Object {
  $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName
  @{ file=$_.Name; status=$signature.Status.ToString(); signer=if($signature.SignerCertificate){$signature.SignerCertificate.Subject}else{$null}; thumbprint=if($signature.SignerCertificate){$signature.SignerCertificate.Thumbprint}else{$null}; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$taskResourceDir = Join-Path $taskRoot 'msvc-tools-resources-complete\Contents\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\1033'
$taskResourceSignatures = @(Get-ChildItem -LiteralPath $taskResourceDir -File | Where-Object { $_.Extension -eq '.dll' } | ForEach-Object {
  $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName
  @{ file=$_.Name; status=$signature.Status.ToString(); signer=if($signature.SignerCertificate){$signature.SignerCertificate.Subject}else{$null}; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$taskReport = @{ inspectedAt=[DateTime]::UtcNow.ToString('o'); downloadedToolExecuted=$false; packageReports=@($taskReports.ToArray()); peSignatures=$taskPeSignatures; resourceSignatures=$taskResourceSignatures; revocationPolicy='EXPLICIT_CERTIFICATE_CHAIN_NO_CHECK; AUTHENTICODE_USES_INSTALLED_WINDOWS_VERIFIER'; noNewExecutableLaunched=$true }
[IO.File]::WriteAllText((Join-Path $taskRoot 'signature-inspection.json'),($taskReport|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$taskReport | ConvertTo-Json -Depth 8
