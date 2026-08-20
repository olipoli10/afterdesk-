import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  assessNativeIsolationBackend,
  type NativeIsolationInventory,
} from "../src/lib/engineering-factory/native-isolation-preflight";

const INVENTORY_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem

function Has-Command([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Service-State([string]$name) {
  $service = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $service) { return "Missing" }
  return [string]$service.Status
}

$hasWsl = Has-Command "wsl.exe"

[pscustomobject]@{
  osCaption = [string]$os.Caption
  osVersion = [string]$os.Version
  osBuild = [string]$os.BuildNumber
  architecture = [string]$os.OSArchitecture
  hypervisorPresent = [bool]$computer.HypervisorPresent
  totalPhysicalMemoryBytes = [double]$computer.TotalPhysicalMemory
  commands = [pscustomobject]@{
    docker = Has-Command "docker.exe"
    podman = Has-Command "podman.exe"
    wsl = $hasWsl
    windowsSandbox = Has-Command "WindowsSandbox.exe"
    vmconnect = Has-Command "vmconnect.exe"
    getVm = Has-Command "Get-VM"
  }
  services = [pscustomobject]@{
    vmcompute = Service-State "vmcompute"
    hns = Service-State "hns"
    vmms = Service-State "vmms"
  }
  wslStatusExitCode = $null
} | ConvertTo-Json -Depth 4 -Compress
`;

function collectInventory(): NativeIsolationInventory {
  const windowsRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powershell = join(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  const result = spawnSync(
    powershell,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", INVENTORY_SCRIPT],
    { encoding: "utf8", windowsHide: true }
  );

  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("native isolation inventory failed closed");
  }

  const inventory = JSON.parse(result.stdout.trim()) as NativeIsolationInventory;
  if (inventory.commands.wsl) {
    const wslStatus = spawnSync("wsl.exe", ["--status"], {
      encoding: "utf8",
      windowsHide: true,
    });
    inventory.wslStatusExitCode = wslStatus.status;
  }
  return inventory;
}

try {
  const report = assessNativeIsolationBackend(collectInventory());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "native isolation preflight failed closed"}\n`
  );
  process.exitCode = 1;
}
