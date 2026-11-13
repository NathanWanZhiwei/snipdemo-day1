$ErrorActionPreference = 'Stop'
& node "$PSScriptRoot\cli.js" @args
exit $LASTEXITCODE
