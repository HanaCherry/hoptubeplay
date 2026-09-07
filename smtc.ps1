$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$winrt = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll"
if (Test-Path $winrt) { [void][Reflection.Assembly]::LoadFrom($winrt) }

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
} | Select-Object -First 1

function Await-WinRT($operation, $resultType) {
  $generic = $asTask.MakeGenericMethod($resultType)
  $task = $generic.Invoke($null, @($operation))
  $ok = $task.Wait(1500)
  if (-not $ok) { return $null }
  if ($task.IsFaulted) { return $null }
  return $task.Result
}

function Get-ThumbBytes($thumb) {
  if (-not $thumb) { return $null }
  $stream = Await-WinRT ($thumb.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  if (-not $stream) { return $null }
  $size = [int]$stream.Size
  if ($size -le 0 -or $size -gt 4000000) { return $null }
  try {
    $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $ms = New-Object IO.MemoryStream
    $netStream.CopyTo($ms)
    return $ms.ToArray()
  } catch {
    return $null
  }
}

function Score-Session($appId, $status, $title) {
  $app = ("$appId").ToLowerInvariant()
  if ($app -notmatch "youtube|chrome|msedge|edge|brave|firefox|opera|vivaldi") { return -1000 }
  $score = 0
  if ($app -match "youtube") { $score += 90 }
  if ($app -match "chrome|msedge|edge|brave|firefox|opera|vivaldi") { $score += 40 }
  if ($status -eq "Playing") { $score += 35 }
  if ($title) { $score += 10 }
  return $score
}

$coverPath = $args[0]
$watch = ($args[1] -eq "watch")
$script:lastThumbKey = ""

function Emit-Now($manager) {
  $best = $null
  $bestScore = -1000
  foreach ($session in @($manager.GetSessions())) {
    $appId = [string]$session.SourceAppUserModelId
    $info = $session.GetPlaybackInfo()
    $status = [string]$info.PlaybackStatus
    $props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $title = if ($props) { [string]$props.Title } else { "" }
    $score = Score-Session $appId $status $title
    if ($score -gt $bestScore) {
      $bestScore = $score
      $best = @{
        session = $session
        appId = $appId
        status = $status
        props = $props
      }
    }
  }

  if (-not $best -or -not $best.props -or -not $best.props.Title) {
    Write-Output '{"ok":false}'
    return
  }

  $timeline = $best.session.GetTimelineProperties()
  $position = 0
  $duration = 0
  if ($timeline) {
    $position = [int][Math]::Max(0, $timeline.Position.TotalMilliseconds)
    $duration = [int][Math]::Max(0, $timeline.EndTime.TotalMilliseconds)
  }

  $key = "$($best.appId)|$($best.props.Title)|$($best.props.Artist)"
  $hasThumb = $false
  if ($coverPath -and $key -ne $script:lastThumbKey) {
    $bytes = Get-ThumbBytes $best.props.Thumbnail
    if ($bytes) {
      [IO.File]::WriteAllBytes($coverPath, $bytes)
      $hasThumb = $true
      $script:lastThumbKey = $key
    }
  } elseif ($script:lastThumbKey -eq $key -and (Test-Path $coverPath)) {
    $hasThumb = $true
  }

  $payload = [ordered]@{
    ok = $true
    appId = $best.appId
    status = $best.status
    title = [string]$best.props.Title
    artist = [string]$best.props.Artist
    album = [string]$best.props.AlbumTitle
    progressMs = $position
    durationMs = $duration
    hasThumb = $hasThumb
  }
  Write-Output ($payload | ConvertTo-Json -Compress)
}

$manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $manager) {
  Write-Output '{"ok":false}'
  if (-not $watch) { exit 0 }
}

if ($watch) {
  while ($true) {
    try {
      if (-not $manager) {
        $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
      }
      if ($manager) { Emit-Now $manager }
      else { Write-Output '{"ok":false}' }
    } catch {
      Write-Output '{"ok":false}'
      $manager = $null
    }
    Start-Sleep -Milliseconds 200
  }
} else {
  if ($manager) { Emit-Now $manager } else { Write-Output '{"ok":false}' }
}
