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

$fragmentWords = New-Object "System.Collections.Generic.HashSet[string]"
@("apat", "na", "buwan", "limang", "taon", "anim", "oras", "pitong", "linggo", "walong") |
  ForEach-Object { [void]$fragmentWords.Add($_) }

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
    "Level 1 Simple" = @{ Level = "beginner"; HeaderRows = 1; SequenceOffset = 0 }
    "Level 2 Intermediate" = @{ Level = "intermediate"; HeaderRows = 1; SequenceOffset = 200 }
    "Level 3 Advanced" = @{ Level = "advanced"; HeaderRows = 1; SequenceOffset = 400 }
  }

  $existingRows = @()
  if (-not $DryRun) {
    $existingRows = Invoke-Supabase "GET" "curriculum_items?select=id,sequence_no,content,reading_level,item_type,is_active&item_type=eq.word&limit=1000"
  }
  $existingByNaturalKey = @{}
  foreach ($row in ($existingRows | ForEach-Object { $_ })) {
    if (@("beginner", "intermediate", "advanced") -notcontains $row.reading_level) { continue }
    $key = "$(Normalize-Text $row.content)|$($row.reading_level)"
    if (-not $existingByNaturalKey.ContainsKey($key)) {
      $existingByNaturalKey[$key] = $row
    }
  }

  $rowsToUpsert = New-Object System.Collections.Generic.List[object]
  $skippedFragments = New-Object System.Collections.Generic.List[object]
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

      $content = ([string]$cells[1]).Trim()
      if (-not $content) { continue }

      $ordinal += 1
      $normalizedContent = Normalize-Text $content
      $level = [string]$config.Level
      $naturalKey = "$normalizedContent|$level"
      $computedSequence = [int]$config.SequenceOffset + $ordinal

      if ($level -eq "intermediate" -and $fragmentWords.Contains($normalizedContent)) {
        $skippedFragments.Add([pscustomobject]@{
          content = $content
          reading_level = $level
          source_sheet = $name
          source_row = $rowNumber
          existing = $existingByNaturalKey[$naturalKey]
        })
        continue
      }

      $existing = $existingByNaturalKey[$naturalKey]
      $metadata = @{}
      if ($level -eq "advanced") {
        $metadata.definition_status = "pending_review"
        $metadata.definition_confidence = "lower"
        $metadata.review_note = "Level 3 definitions are AI-drafted compound phrases and need human review."
      }

      $rowsToUpsert.Add([pscustomobject]@{
        id = if ($existing) { $existing.id } else { "word-{0:D4}" -f $computedSequence }
        sequence_no = if ($existing) { $existing.sequence_no } else { $computedSequence }
        item_type = "word"
        reading_level = $level
        content = $content
        display_text = $content
        syllable_hyphenation = ([string]$cells[4]).Trim()
        definition = ([string]$cells[5]).Trim()
        pattern_note = ([string]$cells[3]).Trim()
        backend_category = $null
        source_sheet = $name
        source_row = $rowNumber
        is_active = $true
        metadata = $metadata
      })
    }

    $sheetIndex += 1
  }

  Write-Host "Workbook rows prepared: $($rowsToUpsert.Count)"
  Write-Host "Level 2 fragments skipped: $($skippedFragments.Count)"
  Write-Host "Level 3 rows marked pending review: $(($rowsToUpsert | Where-Object { $_.reading_level -eq 'advanced' }).Count)"

  if ($DryRun) {
    $skippedFragments | ForEach-Object {
      Write-Host "Skipped fragment: $($_.content) ($($_.source_sheet) row $($_.source_row))"
    }
    return
  }

  for ($i = 0; $i -lt $rowsToUpsert.Count; $i += 100) {
    $chunk = $rowsToUpsert[$i..([Math]::Min($i + 99, $rowsToUpsert.Count - 1))]
    Invoke-Supabase "POST" "curriculum_items?on_conflict=id" $chunk "resolution=merge-duplicates,return=minimal" | Out-Null
  }

  $deactivatedFragments = 0
  foreach ($fragment in $skippedFragments) {
    if (-not $fragment.existing) { continue }
    $body = @{
      is_active = $false
      metadata = @{
        skipped_reason = "fragment_unclear_level_2_entry"
        skipped_by = "importCurriculumWorkbook.ps1"
        source_sheet = $fragment.source_sheet
        source_row = $fragment.source_row
      }
    }
    Invoke-Supabase "PATCH" "curriculum_items?id=eq.$($fragment.existing.id)" $body "return=minimal" | Out-Null
    $deactivatedFragments += 1
  }

  Write-Host "Imported/updated $($rowsToUpsert.Count) curriculum word rows."
  Write-Host "Deactivated $deactivatedFragments existing Level 2 fragment rows."
}
finally {
  if ($tempRoot -like (Join-Path $env:TEMP "linaw_curriculum_import_*")) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
