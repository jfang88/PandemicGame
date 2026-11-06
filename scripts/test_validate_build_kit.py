"""Regression checks for source discovery and existing validation gates."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class BuildKitTests(unittest.TestCase):
    def test_generated_trees_excluded_and_authored_links_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('docs', 'spec', 'config', 'scripts', 'prompts'):
                shutil.copytree(ROOT / name, root / name)
            for path in ROOT.glob('*.md'):
                shutil.copy(path, root / path.name)
            # Ignore nested generated content that would otherwise fail both scans.
            generated = root / 'apps/web/node_modules/fixture'
            generated.mkdir(parents=True)
            (generated / 'README.md').write_text('[bad](missing.md) supa' + 'base')
            command = ['python3', str(root / 'scripts/validate_build_kit.py')]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            authored = root / 'docs/nested'
            authored.mkdir()
            (authored / 'broken.md').write_text('[bad](missing.md)')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('missing link', result.stderr)
            (authored / 'broken.md').write_text('supa' + 'base')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Obsolete provider reference', result.stderr)


if __name__ == '__main__':
    unittest.main()
