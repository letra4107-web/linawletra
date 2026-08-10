param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [string]$OutputPath = "supabase_seed_curriculum_items.sql"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook not found: $WorkbookPath"
}

$tempRoot = Join-Path $env:TEMP ("linaw_curriculum_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

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
  if (Test-Path $sharedPath) {
    [xml]$sst = Get-Content $sharedPath
    $sstNs = New-Object System.Xml.XmlNamespaceManager($sst.NameTable)
    $sstNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    foreach ($si in $sst.SelectNodes("//x:si", $sstNs)) {
      $sharedStrings += (($si.SelectNodes(".//x:t", $sstNs) | ForEach-Object { $_."#text" }) -join "")
    }
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

  function Sql($value) {
    if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) { return "NULL" }
    return "'" + ([string]$value).Replace("'", "''") + "'"
  }

  $sheetConfig = @{
    "Level 1 Simple" = @{ Type = "word"; Level = "beginner"; HeaderRows = 1; SequenceOffset = 0 }
    "Level 2 Intermediate" = @{ Type = "word"; Level = "intermediate"; HeaderRows = 1; SequenceOffset = 200 }
    "Level 3 Advanced" = @{ Type = "word"; Level = "advanced"; HeaderRows = 1; SequenceOffset = 400 }
    "Beginner Phonetics" = @{ Type = "phonetic"; Level = "beginner"; HeaderRows = 3; SequenceOffset = 600 }
    "Intermediate Phrases" = @{ Type = "phrase"; Level = "intermediate"; HeaderRows = 3; SequenceOffset = 800 }
    "Advanced Sentences" = @{ Type = "sentence"; Level = "advanced"; HeaderRows = 3; SequenceOffset = 1000 }
    "Advanced Paragraphs" = @{ Type = "paragraph"; Level = "advanced"; HeaderRows = 3; SequenceOffset = 1200 }
  }

  $rowsOut = New-Object System.Collections.Generic.List[string]
  $sheetIndex = 1
  foreach ($sheet in $sheets) {
    $name = [string]$sheet.name
    if (-not $sheetConfig.ContainsKey($name)) {
      $sheetIndex += 1
      continue
    }

    $config = $sheetConfig[$name]
    $worksheetPath = Join-Path $extractPath "xl\worksheets\sheet$sheetIndex.xml"
    [xml]$worksheet = Get-Content $worksheetPath
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
      if ($cells.Count -lt 2 -or [string]::IsNullOrWhiteSpace($cells[1])) { continue }

      $ordinal += 1
      $sequence = [int]$config.SequenceOffset + $ordinal
      $id = "{0}-{1:D4}" -f $config.Type, $sequence

      $content = $cells[1]
      $pattern = if ($cells.Count -gt 3) { $cells[3] } else { "" }
      $hyphenation = if ($config.Type -eq "word" -and $cells.Count -gt 4) { $cells[4] } else { $content }
      $definition = if ($config.Type -eq "word" -and $cells.Count -gt 5) { $cells[5] } else { "" }
      $backendCategory = if ($config.Type -ne "word" -and $cells.Count -gt 5) { $cells[5] } else { "" }

      $rowsOut.Add("  ($(Sql $id), $sequence, $(Sql $config.Type), $(Sql $config.Level), $(Sql $content), $(Sql $content), $(Sql $hyphenation), $(Sql $definition), $(Sql $pattern), $(Sql $backendCategory), $(Sql $name), $rowNumber)")
    }

    $sheetIndex += 1
  }

  $sql = @()
  $sql += "-- Generated from $WorkbookPath"
  $sql += "-- Review curriculum content before production use."
  $sql += "INSERT INTO public.curriculum_items"
  $sql += "  (id, sequence_no, item_type, reading_level, content, display_text, syllable_hyphenation, definition, pattern_note, backend_category, source_sheet, source_row)"
  $sql += "VALUES"
  $sql += ($rowsOut -join ",`n")
  $sql += "ON CONFLICT (id) DO UPDATE SET"
  $sql += "  sequence_no = EXCLUDED.sequence_no,"
  $sql += "  item_type = EXCLUDED.item_type,"
  $sql += "  reading_level = EXCLUDED.reading_level,"
  $sql += "  content = EXCLUDED.content,"
  $sql += "  display_text = EXCLUDED.display_text,"
  $sql += "  syllable_hyphenation = EXCLUDED.syllable_hyphenation,"
  $sql += "  definition = EXCLUDED.definition,"
  $sql += "  pattern_note = EXCLUDED.pattern_note,"
  $sql += "  backend_category = EXCLUDED.backend_category,"
  $sql += "  source_sheet = EXCLUDED.source_sheet,"
  $sql += "  source_row = EXCLUDED.source_row,"
  $sql += "  updated_at = NOW();"

  Set-Content -LiteralPath $OutputPath -Value ($sql -join "`n") -Encoding UTF8
  Write-Host "Generated $($rowsOut.Count) curriculum rows at $OutputPath"
}
finally {
  if ($tempRoot -like (Join-Path $env:TEMP "linaw_curriculum_*")) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
