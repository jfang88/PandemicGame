#!/usr/bin/env python3
"""Dependency-free validation for this planning kit, not application tests."""
import json
import os
import re
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
errors = []


def source_files(base):
    """Prune generated/dependency trees, but validate all authored subdirectories."""
    excluded = {'.git', 'node_modules', 'dist', '.wrangler', 'coverage',
                'playwright-report', 'test-results', '__pycache__'}
    for directory, dirs, files in os.walk(base):
        dirs[:] = sorted(name for name in dirs if name not in excluded)
        for name in sorted(files):
            yield Path(directory) / name


for path in source_files(root):
    if path.suffix != '.md':
        continue
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
        if target.startswith(('https://', 'http://', '#', 'mailto:')):
            continue
        local = target.split('#')[0]
        if local and not (path.parent / local).exists():
            errors.append(f'{path.relative_to(root)}: missing link {target}')

board = json.loads((root / 'spec/board.v1.json').read_text(encoding='utf-8'))
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

tasks = json.loads((root / 'spec/tasks.json').read_text(encoding='utf-8'))
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
for path in source_files(root):
    if path.is_file() and path.suffix in ('.md', '.json', '.jsonc'):
        assert legacy not in path.read_text(encoding='utf-8').lower(), f'Obsolete provider reference: {path}'
config_text = (root / 'wrangler.jsonc').read_text(encoding='utf-8')
config = json.loads(re.sub(r'^\s*//.*$', '', config_text, flags=re.M))
assert 'name' not in config, 'Require an explicit deployment environment'
assert [migration['new_sqlite_classes'] for migration in config['migrations']] == [['GameRoom'], ['CreateBudget']]
namespace_ids = set()
for env in ('preview', 'production'):
    target = config['env'][env]
    assert target['name'] == f'pandemicgame-{env}'
    assert target['workers_dev'] and not target['preview_urls']
    assert not target['observability']['logs']['invocation_logs']
    assert 'FIREBASE_PROJECT_ID' in target['vars']
    assert not any(key.startswith('VITE_') for key in target['vars'])
    assert target['durable_objects']['bindings'] == [
        {'name': 'GAME_ROOMS', 'class_name': 'GameRoom'},
        {'name': 'CREATE_BUDGETS', 'class_name': 'CreateBudget'},
    ], 'Durable Objects must be local to each named Worker'
    for binding in target['ratelimits']:
        assert binding['namespace_id'] not in namespace_ids, 'Share no preview/production limiter namespaces'
        namespace_ids.add(binding['namespace_id'])
for task in tasks:
    text = (root / task['file']).read_text(encoding='utf-8')
    for section in ('deliverables', 'acceptance', 'checks'):
        for item in task[section]:
            assert item in text, f'Task spec drift: {task["id"]}'

# Release traceability: each acceptance ID once, real evidence anchors, no unproven hosted pass.
STATUSES = {'Pass', 'Local pass; hosted pending', 'Hosted pending'}
HOSTED = {'P06', 'S06', 'S07', 'S09', 'S10', 'U01', 'U02', 'U03', 'U05', 'O01', 'O02', 'O03', 'O04', 'O05'}
RUN_LINK = 'https://github.com/jfang88/PandemicGame/actions/runs/'
acceptance_ids = re.findall(r'^\| ([EPSUO]\d{2}) \|', (root / 'docs/ACCEPTANCE.md').read_text(encoding='utf-8'), flags=re.M)
assert len(acceptance_ids) == len(set(acceptance_ids)), 'Duplicate acceptance ID'
assert HOSTED <= set(acceptance_ids), 'Hosted acceptance IDs must exist'
traced = {}
statuses = Counter()
trace_text = (root / 'docs/TRACEABILITY.md').read_text(encoding='utf-8')
for line in trace_text.splitlines():
    match = re.match(r'^\| ([EPSUO]\d{2}) \| (.+) \|$', line)
    if not match:
        continue
    trace_id, cells = match[1], match[2].split(' | ')
    if trace_id in traced or len(cells) != 4:
        errors.append(f'docs/TRACEABILITY.md: malformed or repeated row {trace_id}')
        continue
    evidence, _check, hosted, status = cells
    traced[trace_id] = status
    statuses[status] += 1
    anchors = re.findall(r'`([^`]+)` “([^”]+)”', evidence)
    if not anchors:
        errors.append(f'docs/TRACEABILITY.md: {trace_id} cites no local evidence')
    for cited, anchor in anchors:
        path = root / cited
        if not path.is_file():
            errors.append(f'docs/TRACEABILITY.md: {trace_id} cites missing file {cited}')
        elif anchor not in path.read_text(encoding='utf-8'):
            errors.append(f'docs/TRACEABILITY.md: {trace_id} anchor not found in {cited}: {anchor}')
    if status not in STATUSES:
        errors.append(f'docs/TRACEABILITY.md: {trace_id} has unknown status {status}')
    elif trace_id in HOSTED and status == 'Pass' and RUN_LINK not in hosted:
        errors.append(f'docs/TRACEABILITY.md: {trace_id} needs a hosted run link before it can pass')
    elif trace_id not in HOSTED and status != 'Pass':
        errors.append(f'docs/TRACEABILITY.md: {trace_id} has no hosted gate and must pass locally')
missing = [trace_id for trace_id in acceptance_ids if trace_id not in traced]
unknown = sorted(set(traced) - set(acceptance_ids))
if missing or unknown:
    errors.append(f'docs/TRACEABILITY.md: untraced {missing}, unknown {unknown}')

if errors:
    raise SystemExit('\n'.join(errors))
summary = ', '.join(f'{count} {status.lower()}' for status, count in sorted(statuses.items()))
print(f'PASS: Markdown links, {len(nodes)} connected board locations, {len(tasks)} ordered tasks; Firebase config/provider consistency; '
      f'{len(traced)} acceptance IDs traced ({summary})')
