[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$validator = Join-Path $repoRoot "specs\194-corrected-openrouter-retest\scripts\validate-r37-corrected-retest.ps1"
$plainKey = $null

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "ENDVERA - Cle OpenRouter temporaire"
  $form.Size = New-Object System.Drawing.Size(620,230)
  $form.StartPosition = "CenterScreen"
  $form.TopMost = $true
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $label = New-Object System.Windows.Forms.Label
  $label.Location = New-Object System.Drawing.Point(20,18)
  $label.Size = New-Object System.Drawing.Size(565,60)
  $label.Text = "Revoque la cle affichee. Cree une nouvelle cle, colle-la ici, puis clique Demarrer. Le texte reste masque."
  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Location = New-Object System.Drawing.Point(20,85)
  $textBox.Size = New-Object System.Drawing.Size(565,28)
  $textBox.UseSystemPasswordChar = $true
  $button = New-Object System.Windows.Forms.Button
  $button.Location = New-Object System.Drawing.Point(435,130)
  $button.Size = New-Object System.Drawing.Size(150,35)
  $button.Text = "Demarrer le retest"
  $button.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.AcceptButton = $button
  $form.Controls.AddRange(@($label,$textBox,$button))
  $textBox.Focus() | Out-Null
  if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "R37_CREDENTIAL_INPUT_CANCELLED" }
  $plainKey = $textBox.Text
  $textBox.Clear()
  $form.Dispose()
  if ([string]::IsNullOrWhiteSpace($plainKey)) { throw "R37_CREDENTIAL_INPUT_INVALID" }
  if ($plainKey.Length -lt 20) { throw "R37_CREDENTIAL_INPUT_INVALID" }
  $env:R37_OPENROUTER_CONTROLLER_API_KEY = $plainKey
  $plainKey = $null
  Push-Location $repoRoot
  try { & $validator -RequireComplete } finally { Pop-Location }
} finally {
  Remove-Item Env:R37_OPENROUTER_CONTROLLER_API_KEY -ErrorAction SilentlyContinue
  $plainKey = $null
  Remove-Variable form,label,textBox,button,plainKey -ErrorAction SilentlyContinue
}
