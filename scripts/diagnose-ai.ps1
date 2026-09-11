param(
    [ValidateSet('Bot', 'Backend')][string]$Target = 'Bot',
    [string]$AiBotUrl = 'https://retro-platform-ai-bot.onrender.com',
    [string]$BackendUrl = $env:RETRO_BACKEND_URL,
    [string]$RoomCode = $env:RETRO_ROOM_CODE
)

$ErrorActionPreference = 'Stop'
$payload = @{
    topic = 'Sprint iletişimi ve geliştirme alanları'
    reportText = $null
    reportFile = $null
    language = 'tr'
    style = 'dengeli'
    count = 20
    replaceExisting = $false
} | ConvertTo-Json -Compress

if ($Target -eq 'Bot') {
    if ([string]::IsNullOrWhiteSpace($env:INTERNAL_SERVICE_KEY)) { throw 'Set INTERNAL_SERVICE_KEY in this process; do not print it.' }
    $baseUrl = $AiBotUrl.TrimEnd('/')
    $headers = @{ 'X-Internal-Service-Key' = $env:INTERNAL_SERVICE_KEY }
    $route = '/questions/generate'
} else {
    if ([string]::IsNullOrWhiteSpace($BackendUrl)) { throw 'Provide the actual deployed backend URL using -BackendUrl or RETRO_BACKEND_URL.' }
    if ($RoomCode -notmatch '^[A-Z0-9]{6}$') { throw 'Provide an existing room code using -RoomCode or RETRO_ROOM_CODE.' }
    if ([string]::IsNullOrWhiteSpace($env:RETRO_PLAYER_ID) -or [string]::IsNullOrWhiteSpace($env:RETRO_RECONNECT_TOKEN)) {
        throw 'Set RETRO_PLAYER_ID and RETRO_RECONNECT_TOKEN to the existing room host credentials in this process.'
    }
    $baseUrl = $BackendUrl.TrimEnd('/')
    $headers = @{ 'X-Player-Id' = $env:RETRO_PLAYER_ID; 'X-Reconnect-Token' = $env:RETRO_RECONNECT_TOKEN }
    $route = "/api/rooms/$RoomCode/ai/questions"
}
$parsedUrl = [Uri]$baseUrl
if (!$parsedUrl.IsAbsoluteUri -or $parsedUrl.Scheme -ne 'https' -or $parsedUrl.UserInfo -or $parsedUrl.Query -or $parsedUrl.Fragment) {
    throw 'Use an absolute HTTPS service URL without credentials, query strings, or fragments.'
}

function Invoke-SafeDiagnosticRequest {
    param([string]$Uri, [string]$Method, [hashtable]$Headers = @{}, [byte[]]$Body)
    try {
        $arguments = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = 150; MaximumRedirection = 0; UseBasicParsing = $true }
        if ($null -ne $Body) { $arguments.Body = $Body; $arguments.ContentType = 'application/json; charset=utf-8' }
        $response = Invoke-WebRequest @arguments
        Write-Host "[Diagnostic] target=$Target method=$Method status=$([int]$response.StatusCode)"
        return ($response.Content | ConvertFrom-Json)
    } catch {
        $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'unavailable' }
        # Never display the response/error body, headers, or supplied credentials.
        throw "Diagnostic request failed status=$status; inspect the corresponding service logs."
    }
}

$health = Invoke-SafeDiagnosticRequest -Uri "$baseUrl/health" -Method GET
Write-Host "[Diagnostic] health=$($health.status)"
$result = Invoke-SafeDiagnosticRequest -Uri "$baseUrl$route" -Method POST -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($payload))
$count = @($result.questions).Count
Write-Host "[Diagnostic] provider=$($result.provider) count=$count"
if ($result.provider -ne 'gemini' -or $count -ne 20) {
    throw 'Gemini success was not proven: the response used fallback or had an unexpected question count. Inspect source/failure logs.'
}
Write-Host '[Diagnostic] Gemini question set received. For Backend, distinguish fresh generation from room-cache using ai-bot logs.'
