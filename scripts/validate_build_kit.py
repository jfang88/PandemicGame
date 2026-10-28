#!/usr/bin/env python3
"""Dependency-free validation for this planning kit, not application tests."""
import json
import re
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
errors = []
for path in root.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if target.startswith(('https://', 'http://', '#', 'mailto:')):
            continue
        local = target.split('#')[0]
        if local and not (path.parent / local).exists():
            errors.append(f'{path.relative_to(root)}: missing link {target}')

board = json.loads((root / 'spec/board.v1.json').read_text())
nodes = board['locations']
ids = {n['id'] for n in nodes}
assert len(nodes) == len(ids) == 48
assert Counter(n['color'] for n in nodes) == dict.fromkeys(['blue', 'yellow', 'red', 'black'], 12)
by_id = {n['id']: n for n in nodes}
for n in nodes:
    assert n['id'] not in n['neighbors']
    assert len(n['neighbors']) == len(set(n['neighbors']))
    assert n['neighbors'] == sorted(n['neighbors'])
    for neighbor in n['neighbors']:
        assert neighbor in ids and n['id'] in by_id[neighbor]['neighbors']
seen, pending = set(), [board['startLocation']]
while pending:
    node = pending.pop()
    if node not in seen:
        seen.add(node)
        pending.extend(by_id[node]['neighbors'])
assert seen == ids

tasks = json.loads((root / 'spec/tasks.json').read_text())
known = {t['id'] for t in tasks}
assert len(known) == len(tasks) == 18
completed = set()
for task in tasks:
    assert set(task['dependsOn']) <= completed, f'Bad task order/dependency: {task["id"]}'
    assert (root / task['file']).exists()
    for ref in task['read']:
        assert (root / ref).exists(), f'Missing reference: {ref}'
    assert task['acceptance'] and task['deliverables'] and task['checks']
    completed.add(task['id'])

# Keep the provider switch consistent before any coding agent starts.
legacy = 'supa' + 'base'
for path in root.rglob('*'):
    if path.is_file() and path.suffix in ('.md', '.json', '.jsonc'):
        assert legacy not in path.read_text().lower(), f'Obsolete provider reference: {path}'
config_text = (root / 'config/wrangler.example.jsonc').read_text()
config = json.loads(re.sub(r'^\s*//.*$', '', config_text, flags=re.M))
for env in ('preview', 'production'):
    assert 'FIREBASE_PROJECT_ID' in config['env'][env]['vars']
    assert not any(key.startswith('VITE_') for key in config['env'][env]['vars'])
for task in tasks:
    text = (root / task['file']).read_text()
    for section in ('deliverables', 'acceptance', 'checks'):
        for item in task[section]:
            assert item in text, f'Task spec drift: {task["id"]}'

if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: Markdown links, {len(nodes)} connected board locations, {len(tasks)} ordered tasks; Firebase config/provider consistency')
