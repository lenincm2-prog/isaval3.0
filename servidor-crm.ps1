param(
  [int]$Port = 8000,
  [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path $Root).Path

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
}

function Get-LocalIpAddresses {
  ipconfig |
    Select-String -Pattern "IPv4.*?:\s*([0-9.]+)" |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Where-Object { $_ -notlike "127.*" -and $_ -notlike "169.254.*" } |
    Select-Object -Unique
}

function Send-HttpResponse {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType = "text/plain; charset=utf-8"
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

function Resolve-RequestPath {
  param([string]$UrlPath)

  $path = [System.Uri]::UnescapeDataString(($UrlPath -split "\?")[0].TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($path)) {
    $path = "index.html"
  }

  $candidate = Join-Path $Root $path
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    return $null
  }

  $resolved = (Resolve-Path -LiteralPath $candidate).Path
  if (-not $resolved.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  return $resolved
}

try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "No se pudo abrir el puerto $Port." -ForegroundColor Red
  Write-Host "Revisa si ya hay otro servidor usando ese puerto o permite PowerShell en el firewall."
  Write-Host $_.Exception.Message
  pause
  exit 1
}

Write-Host ""
Write-Host "==============================================="
Write-Host " ISAVAL CRM Historico - Servidor local"
Write-Host "==============================================="
Write-Host ""
Write-Host "Carpeta: $Root"
Write-Host "Puerto:  $Port"
Write-Host ""
Write-Host "Desde esta PC:"
Write-Host "  http://localhost:$Port"
Write-Host ""
Write-Host "Desde otras PCs de la misma red, abrir:"
Get-LocalIpAddresses | ForEach-Object { Write-Host "  http://$($_):$Port" }
Write-Host ""
Write-Host "Deja esta ventana abierta mientras se use el CRM."
Write-Host "Para detener el servidor, presiona Ctrl+C."
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      while ($reader.ReadLine()) {}

      if (-not $requestLine) {
        continue
      }

      $parts = $requestLine.Split(" ")
      $file = if ($parts.Length -ge 2) { Resolve-RequestPath $parts[1] } else { $null }

      if (-not $file) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 - No encontrado")
        Send-HttpResponse $stream 404 "Not Found" $body
        continue
      }

      $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
      $contentType = if ($contentTypes.ContainsKey($extension)) { $contentTypes[$extension] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      Send-HttpResponse $stream 200 "OK" $bytes $contentType
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
