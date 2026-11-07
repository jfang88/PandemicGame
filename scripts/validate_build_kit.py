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

if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: Markdown links, {len(nodes)} connected board locations, {len(tasks)} ordered tasks; Firebase config/provider consistency')
