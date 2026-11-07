"""Regression checks for source discovery and existing validation gates."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = shutil.ignore_patterns('node_modules', 'dist', '.wrangler', 'test-results', '__pycache__')


def copy_kit(root):
    """Copy authored files, including the test sources that the traceability matrix cites."""
    for name in ('docs', 'spec', 'config', 'scripts', 'prompts', 'packages', 'apps', 'tests', '.github'):
        shutil.copytree(ROOT / name, root / name, ignore=GENERATED)
    shutil.copy(ROOT / 'wrangler.jsonc', root / 'wrangler.jsonc')
    for path in ROOT.glob('*.md'):
        shutil.copy(path, root / path.name)


class BuildKitTests(unittest.TestCase):
    def test_traceability_rejects_missing_ids_stale_anchors_and_unproven_hosted_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            copy_kit(root)
            command = [sys.executable, str(root / 'scripts/validate_build_kit.py')]
            result = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('52 acceptance IDs traced', result.stdout)
            matrix = root / 'docs/TRACEABILITY.md'
            original = matrix.read_text(encoding='utf-8')
            row = next(line for line in original.splitlines() if line.startswith('| O04 |'))
            cases = {
                'untraced': original.replace(row + '\n', ''),
                'anchor not found': original.replace('“E03 movement”', '“E03 teleportation”'),
                'missing file': original.replace('actions.test.ts` “E03', 'removed.test.ts` “E03'),
                'needs a hosted run link': original.replace(row, row.replace('Local pass; hosted pending', 'Pass')),
                'must pass locally': original.replace('Not required | Pass |\n| E04', 'Not required | Hosted pending |\n| E04'),
                'unknown status': original.replace(row, row.replace('Local pass; hosted pending', 'Probably fine')),
            }
            for expected, text in cases.items():
                matrix.write_text(text, encoding='utf-8')
                result = subprocess.run(command, capture_output=True, encoding='utf-8')
                self.assertNotEqual(result.returncode, 0, expected)
                self.assertIn(expected, result.stderr)
            hosted = row.replace('Local pass; hosted pending', 'Pass').replace(
                'Deploy, roll back', '[Run](https://github.com/jfang88/PandemicGame/actions/runs/1) Deploy, roll back')
            matrix.write_text(original.replace(row, hosted), encoding='utf-8')
            result = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_generated_trees_excluded_and_authored_links_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            copy_kit(root)
            # Ignore nested generated content that would otherwise fail both scans.
            generated = root / 'apps/web/node_modules/fixture'
            generated.mkdir(parents=True)
            (generated / 'README.md').write_text('[bad](missing.md) supa' + 'base')
            command = [sys.executable, str(root / 'scripts/validate_build_kit.py')]
            result = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            authored = root / 'docs/nested'
            authored.mkdir()
            (authored / 'broken.md').write_text('[bad](missing.md)')
            result = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('missing link', result.stderr)
            (authored / 'broken.md').write_text('supa' + 'base')
            result = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Obsolete provider reference', result.stderr)


if __name__ == '__main__':
    unittest.main()
