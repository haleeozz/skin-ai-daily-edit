$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskVideo = Join-Path $taskRoot 'submission\video'
New-Item -ItemType Directory -Path $taskVideo -Force | Out-Null
$taskSegments = Get-Content -LiteralPath (Join-Path $taskRoot 'submission\demo-script.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskVoice = New-Object -ComObject SAPI.SpVoice
$taskVoice.Voice = $taskVoice.GetVoices('Language=409').Item(0)
$taskVoice.Rate = 0
foreach ($taskSegment in $taskSegments) {
  $taskStream = New-Object -ComObject SAPI.SpFileStream
  $taskStream.Format.Type = 22
  $taskStream.Open((Join-Path $taskVideo ($taskSegment.id + '.wav')), 3)
  $taskVoice.AudioOutputStream = $taskStream
  [void]$taskVoice.Speak($taskSegment.text)
  $taskStream.Close()
}
Write-Output "Prepared $($taskSegments.Count) English narration segments using the local Windows voice."
