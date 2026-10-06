# Aplicativo local (Requerimento do Servidor e Portarias)
# Abre um servidor que so atende este computador (127.0.0.1) e entrega a pagina
# e as planilhas da pasta configurada. Nenhum dado sai do computador.
# Compativel com o Windows PowerShell 5.1 (ja instalado no Windows).
# Sem parametros abre o Requerimento do Servidor; Portarias.bat usa -Pagina portarias.html.
param(
    [string]$Pagina = '',
    [int]$PortaInicial = 8765,
    [string]$Titulo = 'Requerimento do Servidor'
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

# Pasta das planilhas: "planilhas" ao lado deste arquivo, ou o caminho escrito em pasta.txt
$pasta = Join-Path $raiz 'planilhas'
$config = Join-Path $raiz 'pasta.txt'
if (Test-Path -LiteralPath $config) {
    $linha = (Get-Content -LiteralPath $config -Encoding UTF8 | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') } | Select-Object -First 1)
    if ($linha) { $pasta = [Environment]::ExpandEnvironmentVariables($linha.Trim().Trim('"')) }
}
if (-not (Test-Path -LiteralPath $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
$pasta = (Resolve-Path -LiteralPath $pasta).Path

$tipos = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.png' = 'image/png'; '.woff2' = 'font/woff2'; '.json' = 'application/json; charset=utf-8'
    '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; '.xls' = 'application/vnd.ms-excel'
}

function Listar-Planilhas {
    Get-ChildItem -LiteralPath $pasta -File | Where-Object {
        ($_.Extension -eq '.xlsx' -or $_.Extension -eq '.xls') -and -not $_.Name.StartsWith('~$')
    }
}

function Enviar($stream, [int]$status, [string]$tipo, [byte[]]$corpo) {
    $textos = @{ 200 = 'OK'; 400 = 'Bad Request'; 404 = 'Not Found'; 405 = 'Method Not Allowed'; 500 = 'Internal Server Error' }
    $cab = "HTTP/1.1 $status $($textos[$status])`r`nContent-Type: $tipo`r`nContent-Length: $($corpo.Length)`r`n" +
           "Cache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $b = [Text.Encoding]::ASCII.GetBytes($cab)
    $stream.Write($b, 0, $b.Length)
    if ($corpo.Length) { $stream.Write($corpo, 0, $corpo.Length) }
}

function Enviar-Texto($stream, [int]$status, [string]$tipo, [string]$texto) {
    Enviar $stream $status $tipo ([Text.Encoding]::UTF8.GetBytes($texto))
}

function Atender($cliente) {
    $stream = $cliente.GetStream()
    $stream.ReadTimeout = 3000
    try {
        # le o cabecalho da requisicao
        $buf = New-Object byte[] 8192
        $req = ''
        while (-not $req.Contains("`r`n`r`n")) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { return }
            $req += [Text.Encoding]::ASCII.GetString($buf, 0, $n)
            if ($req.Length -gt 65536) { return }
        }
        $partes = $req.Split("`r`n")[0].Split(' ')
        if ($partes.Length -lt 2) { Enviar-Texto $stream 400 'text/plain' 'Requisicao invalida'; return }
        if ($partes[0] -ne 'GET') { Enviar-Texto $stream 405 'text/plain' 'Metodo nao permitido'; return }
        $alvo = $partes[1]
        $caminho = $alvo.Split('?')[0]
        $consulta = ''
        if ($alvo.Contains('?')) { $consulta = $alvo.Substring($alvo.IndexOf('?') + 1) }
        $caminho = [Uri]::UnescapeDataString($caminho)

        if ($caminho -eq '/api/planilhas') {
            $lista = @(Listar-Planilhas | ForEach-Object {
                [ordered]@{
                    nome       = $_.Name
                    tamanho    = $_.Length
                    modificado = [long]([DateTimeOffset]$_.LastWriteTimeUtc).ToUnixTimeMilliseconds()
                }
            })
            $json = ConvertTo-Json -InputObject ([ordered]@{ pasta = $pasta; arquivos = $lista }) -Depth 4 -Compress
            Enviar-Texto $stream 200 'application/json; charset=utf-8' $json
            return
        }

        if ($caminho -eq '/api/arquivo') {
            $nome = $null
            foreach ($par in $consulta.Split('&')) {
                if ($par.StartsWith('nome=')) { $nome = [Uri]::UnescapeDataString($par.Substring(5).Replace('+', ' ')) }
            }
            # so entrega arquivos que estao na lista da pasta (nunca um caminho qualquer)
            $arq = Listar-Planilhas | Where-Object { $_.Name -eq $nome } | Select-Object -First 1
            if (-not $arq) { Enviar-Texto $stream 404 'text/plain' 'Planilha nao encontrada'; return }
            $fs = New-Object IO.FileStream($arq.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
            try {
                $ms = New-Object IO.MemoryStream
                $fs.CopyTo($ms)
                Enviar $stream 200 $tipos[$arq.Extension.ToLower()] $ms.ToArray()
            } finally { $fs.Dispose() }
            return
        }

        # arquivos da pagina (index.html, js/, vendor/, assets/)
        if ($caminho -eq '/') { $caminho = '/index.html' }
        $relativo = $caminho.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
        $completo = [IO.Path]::GetFullPath((Join-Path $raiz $relativo))
        $ext = [IO.Path]::GetExtension($completo).ToLower()
        $dentro = $completo.StartsWith($raiz + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
        if (-not $dentro -or -not $tipos.ContainsKey($ext) -or $ext -eq '.xlsx' -or $ext -eq '.xls' -or
            -not (Test-Path -LiteralPath $completo -PathType Leaf)) {
            Enviar-Texto $stream 404 'text/plain' 'Nao encontrado'
            return
        }
        Enviar $stream 200 $tipos[$ext] ([IO.File]::ReadAllBytes($completo))
    } catch {
        try { Enviar-Texto $stream 500 'text/plain' $_.Exception.Message } catch { }
    } finally {
        $cliente.Close()
    }
}

# escolhe uma porta livre (mesma porta sempre que possivel, para manter as configuracoes salvas)
$ouvinte = $null
foreach ($p in $PortaInicial..($PortaInicial + 20)) {
    try {
        $ouvinte = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
        $ouvinte.Start()
        $porta = $p
        break
    } catch { $ouvinte = $null }
}
if (-not $ouvinte) { Write-Host "Nao foi possivel abrir o aplicativo: nenhuma porta livre entre $PortaInicial e $($PortaInicial + 20)."; Read-Host 'Enter para sair'; exit 1 }

$endereco = "http://127.0.0.1:$porta/"
Write-Host ''
Write-Host "  $Titulo - aplicativo local" -ForegroundColor Cyan
Write-Host "  Endereco:  $endereco"
Write-Host "  Planilhas: $pasta"
Write-Host ''
Write-Host '  Deixe esta janela aberta enquanto usar o sistema. Feche-a para encerrar.' -ForegroundColor Yellow
Write-Host ''

if (-not $env:REQUERIMENTO_SEM_NAVEGADOR) { Start-Process ($endereco + $Pagina) }

try {
    while ($true) {
        $cliente = $ouvinte.AcceptTcpClient()
        Atender $cliente
    }
} finally {
    $ouvinte.Stop()
}
