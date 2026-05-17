from pathlib import Path
import sys
text = Path('src/pages/StudentDashboard.js').read_text(encoding='utf-8')
brace = 0
line_no = 1
in_single = False
in_double = False
in_tpl = False
escaped = False
for ch in text:
    if ch == '\n':
        line_no += 1
        escaped = False
        continue
    if escaped:
        escaped = False
        continue
    if ch == '\\':
        escaped = True
        continue
    if ch == '"' and not in_single and not in_tpl:
        in_double = not in_double
        continue
    if ch == "'" and not in_double and not in_tpl:
        in_single = not in_single
        continue
    if ch == '`' and not in_single and not in_double:
        in_tpl = not in_tpl
        continue
    if in_single or in_double or in_tpl:
        continue
    if ch == '{':
        brace += 1
    elif ch == '}':
        brace -= 1
    if brace < 0:
        print('NEG', line_no)
        sys.exit(0)
print('FINAL', brace)
