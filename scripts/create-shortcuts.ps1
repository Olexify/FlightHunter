<#
    Creates "Flight Hunter" shortcuts pointing at FlightHunter.bat — one beside
    the project and one on the Desktop.

    Shortcuts store an absolute path, so they are machine-specific and are not
    committed (see .gitignore). Run this after cloning, or if you move the
    project folder:

        powershell -ExecutionPolicy Bypass -File scripts\create-shortcuts.ps1
#>

$ErrorActionPreference = 'Stop'

# Resolve the project root from this script's location, so it works regardless
# of the working directory it is invoked from.
$root   = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'FlightHunter.bat'
$icon   = Join-Path $root 'assets\flighthunter.ico'

if (-not (Test-Path $target)) {
    throw "Launcher not found at $target"
}

# GetFolderPath follows a OneDrive-redirected Desktop; $env:USERPROFILE does not.
$desktop = [Environment]::GetFolderPath('Desktop')

$locations = @(
    (Join-Path $root    'Flight Hunter.lnk'),
    (Join-Path $desktop 'Flight Hunter.lnk')
)

$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($path in $locations) {
        $lnk = $shell.CreateShortcut($path)
        $lnk.TargetPath       = $target
        $lnk.WorkingDirectory = $root
        $lnk.Description      = 'Flight Hunter - multi-origin flight search'
        $lnk.WindowStyle      = 1          # normal window, so the log stays visible
        if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
        $lnk.Save()

        Write-Host "  created  $path"
    }
}
finally {
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}

Write-Host ''
Write-Host '  Done. Double-click "Flight Hunter" to start the app.'
