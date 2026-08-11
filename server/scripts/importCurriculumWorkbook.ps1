param(
  [string]$WorkbookPath = (Join-Path $PSScriptRoot "Tagalog_Phonetic_Words_Dyslexia_App_Updated_WITH_DEFINITIONS.xlsx"),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook not found: $WorkbookPath"
}

function Import-EnvFile($Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $key, $value = $line.Split("=", 2)
    $value = $value.Trim().Trim('"').Trim("'")
    if (-not [Environment]::GetEnvironmentVariable($key)) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

Import-EnvFile (Join-Path $PSScriptRoot "..\.env")
Import-EnvFile (Join-Path $PSScriptRoot "..\.env.local")

$supabaseUrl = [Environment]::GetEnvironmentVariable("SUPABASE_URL")
if (-not $supabaseUrl) {
  $supabaseUrl = [Environment]::GetEnvironmentVariable("REACT_APP_SUPABASE_URL")
}
$serviceKey = [Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")

if (-not $supabaseUrl -or -not $serviceKey) {
  throw "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in server/.env or the current environment."
}

$headers = @{
  apikey = $serviceKey
  Authorization = "Bearer $serviceKey"
  "Content-Type" = "application/json"
}

$tempRoot = Join-Path $env:TEMP ("linaw_curriculum_import_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Normalize-Text($Value) {
  return ([string]$Value).Trim().ToLowerInvariant() -replace "\s+", " "
}

function Get-CellText($cell, $ns, $sharedStrings) {
  $inline = $cell.SelectNodes(".//x:is//x:t", $ns)
  if ($inline -and $inline.Count -gt 0) {
    return (($inline | ForEach-Object { $_."#text" }) -join "").Trim()
  }
  $value = $cell.SelectSingleNode("./x:v", $ns)
  if (-not $value) { return "" }
  if ($cell.t -eq "s") { return $sharedStrings[[int]$value."#text"].Trim() }
  return [string]$value."#text"
}

function Get-ColumnIndex($cellRef) {
  $letters = ([string]$cellRef -replace '[^A-Z]', '')
  $index = 0
  foreach ($char in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$char - [int][char]'A' + 1)
  }
  return $index - 1
}

function Invoke-Supabase($Method, $Path, $Body = $null, $Prefer = $null) {
  $uri = "$supabaseUrl/rest/v1/$Path"
  $requestHeaders = $headers.Clone()
  if ($Prefer) { $requestHeaders.Prefer = $Prefer }
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $requestHeaders
  }
  $json = $Body | ConvertTo-Json -Depth 12
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $requestHeaders -Body $json
}

try {
  $zipPath = Join-Path $tempRoot "workbook.zip"
  $extractPath = Join-Path $tempRoot "xlsx"
  Copy-Item -LiteralPath $WorkbookPath -Destination $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath

  [xml]$workbook = Get-Content (Join-Path $extractPath "xl\workbook.xml")
  $workbookNs = New-Object System.Xml.XmlNamespaceManager($workbook.NameTable)
  $workbookNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  $sheets = $workbook.SelectNodes("//x:sheet", $workbookNs)

  $sharedStrings = @()
  $sharedPath = Join-Path $extractPath "xl\sharedStrings.xml"
  if (Test-Path -LiteralPath $sharedPath) {
    [xml]$sst = Get-Content -LiteralPath $sharedPath
    $sstNs = New-Object System.Xml.XmlNamespaceManager($sst.NameTable)
    $sstNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    foreach ($si in $sst.SelectNodes("//x:si", $sstNs)) {
      $sharedStrings += (($si.SelectNodes(".//x:t", $sstNs) | ForEach-Object { $_."#text" }) -join "")
    }
  }

  $sheetConfig = @{
    "Level 1 Simple" = @{ Level = "beginner"; Type = "word"; HeaderRows = 1; SequenceOffset = 1000; ContentColumn = 1; SyllableColumn = 4; DefinitionColumn = 5; PatternColumn = 3; BackendCategoryColumn = $null }
    "Beginner Phonetics" = @{ Level = "beginner"; Type = "phonetic"; HeaderRows = 3; SequenceOffset = 2000; ContentColumn = 1; SyllableColumn = $null; DefinitionColumn = $null; PatternColumn = 4; BackendCategoryColumn = 5 }
    "Level 2 Intermediate" = @{ Level = "intermediate"; Type = "word"; HeaderRows = 1; SequenceOffset = 3000; ContentColumn = 1; SyllableColumn = 4; DefinitionColumn = 5; PatternColumn = 3; BackendCategoryColumn = $null }
    "Intermediate Phrases" = @{ Level = "intermediate"; Type = "phrase"; HeaderRows = 3; SequenceOffset = 4000; ContentColumn = 1; SyllableColumn = $null; DefinitionColumn = $null; PatternColumn = 4; BackendCategoryColumn = 5 }
    "Level 3 Advanced" = @{ Level = "advanced"; Type = "word"; HeaderRows = 1; SequenceOffset = 5000; ContentColumn = 1; SyllableColumn = 4; DefinitionColumn = 5; PatternColumn = 3; BackendCategoryColumn = $null }
    "Advanced Sentences" = @{ Level = "advanced"; Type = "sentence"; HeaderRows = 3; SequenceOffset = 6000; ContentColumn = 1; SyllableColumn = $null; DefinitionColumn = $null; PatternColumn = 4; BackendCategoryColumn = 5 }
    "Advanced Paragraphs" = @{ Level = "advanced"; Type = "paragraph"; HeaderRows = 3; SequenceOffset = 7000; ContentColumn = 1; SyllableColumn = $null; DefinitionColumn = $null; PatternColumn = 4; BackendCategoryColumn = 5 }
  }

  $existingRows = @()
  if (-not $DryRun) {
    $existingRows = Invoke-Supabase "GET" "curriculum_items?select=id,sequence_no,content,reading_level,item_type,is_active&limit=5000"
  }
  $existingByNaturalKey = @{}
  foreach ($row in ($existingRows | ForEach-Object { $_ })) {
    if (@("beginner", "intermediate", "advanced") -notcontains $row.reading_level) { continue }
    $key = "$(Normalize-Text $row.content)|$($row.reading_level)|$($row.item_type)"
    if (-not $existingByNaturalKey.ContainsKey($key)) {
      $existingByNaturalKey[$key] = $row
    }
  }

  $rowsToUpsert = New-Object System.Collections.Generic.List[object]
  $sheetIndex = 1

  foreach ($sheet in $sheets) {
    $name = [string]$sheet.name
    if (-not $sheetConfig.ContainsKey($name)) {
      $sheetIndex += 1
      continue
    }

    $config = $sheetConfig[$name]
    $worksheetPath = Join-Path $extractPath "xl\worksheets\sheet$sheetIndex.xml"
    [xml]$worksheet = Get-Content -LiteralPath $worksheetPath
    $wsNs = New-Object System.Xml.XmlNamespaceManager($worksheet.NameTable)
    $wsNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $rows = $worksheet.SelectNodes("//x:sheetData/x:row", $wsNs)
    $ordinal = 0

    foreach ($row in $rows) {
      $rowNumber = [int]$row.r
      if ($rowNumber -le [int]$config.HeaderRows) { continue }

      $cells = @("", "", "", "", "", "")
      foreach ($cell in $row.SelectNodes("./x:c", $wsNs)) {
        $columnIndex = Get-ColumnIndex $cell.r
        if ($columnIndex -ge 0 -and $columnIndex -lt $cells.Count) {
          $cells[$columnIndex] = Get-CellText $cell $wsNs $sharedStrings
        }
      }

      $contentColumn = [int]$config.ContentColumn
      $content = ([string]$cells[$contentColumn]).Trim()
      if (-not $content) { continue }

      $ordinal += 1
      $normalizedContent = Normalize-Text $content
      $level = [string]$config.Level
      $itemType = [string]$config.Type
      $naturalKey = "$normalizedContent|$level|$itemType"
      $computedSequence = [int]$config.SequenceOffset + $ordinal

      $existing = $existingByNaturalKey[$naturalKey]
      $metadata = @{}
      if ($level -eq "advanced" -and $itemType -eq "word") {
        $metadata.definition_status = "pending_review"
        $metadata.definition_confidence = "lower"
        $metadata.review_note = "Level 3 definitions are AI-drafted compound phrases and need human review."
      }

      $syllableHyphenation = if ($null -ne $config.SyllableColumn) { ([string]$cells[[int]$config.SyllableColumn]).Trim() } else { $content }
      $definition = if ($null -ne $config.DefinitionColumn) { ([string]$cells[[int]$config.DefinitionColumn]).Trim() } else { $null }
      $patternNote = if ($null -ne $config.PatternColumn) { ([string]$cells[[int]$config.PatternColumn]).Trim() } else { $null }
      $backendCategory = if ($null -ne $config.BackendCategoryColumn) { ([string]$cells[[int]$config.BackendCategoryColumn]).Trim() } else { $null }

      $rowsToUpsert.Add([pscustomobject]@{
        id = if ($existing) { $existing.id } else { ("{0}-{1:D4}" -f $itemType, $computedSequence) }
        sequence_no = if ($existing) { $existing.sequence_no } else { $computedSequence }
        item_type = $itemType
        reading_level = $level
        content = $content
        display_text = $content
        syllable_hyphenation = $syllableHyphenation
        definition = $definition
        pattern_note = $patternNote
        backend_category = $backendCategory
        source_sheet = $name
        source_row = $rowNumber
        is_active = $true
        metadata = $metadata
      })
    }

    $sheetIndex += 1
  }

  Write-Host "Workbook rows prepared: $($rowsToUpsert.Count)"
  Write-Host "Level 3 word rows marked pending review: $(($rowsToUpsert | Where-Object { $_.reading_level -eq 'advanced' -and $_.item_type -eq 'word' }).Count)"
  $rowsToUpsert | Group-Object item_type, reading_level | ForEach-Object {
    Write-Host "Prepared $($_.Count) $($_.Name)"
  }

  if ($DryRun) {
    return
  }

  for ($i = 0; $i -lt $rowsToUpsert.Count; $i += 100) {
    $chunk = $rowsToUpsert[$i..([Math]::Min($i + 99, $rowsToUpsert.Count - 1))]
    Invoke-Supabase "POST" "curriculum_items?on_conflict=id" $chunk "resolution=merge-duplicates,return=minimal" | Out-Null
  }

  Write-Host "Imported/updated $($rowsToUpsert.Count) curriculum rows."
}
finally {
  if ($tempRoot -like (Join-Path $env:TEMP "linaw_curriculum_import_*")) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
