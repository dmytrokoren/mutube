import sys
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import patcher

class SafetyTests(unittest.TestCase):
    def test_allocator_failure_does_not_advance(self):
        a = patcher.Allocator(3, 12)
        self.assertEqual(a.alloc(4, 4), 4)
        with self.assertRaisesRegex(ValueError, 'out of space'):
            a.alloc(5, 4)
        self.assertEqual(a.cursor, 8)
        self.assertEqual(a.alloc(4, 4), 8)

    def test_ipa_only_binary_changes(self):
        root = Path(patcher.__file__).parent
        with zipfile.ZipFile(root/'ipa/YouTube_4.54.01_decrypted.ipa') as before, zipfile.ZipFile(root/'mutube.ipa') as after:
            self.assertEqual(before.namelist(), after.namelist())
            for name in before.namelist():
                if not name.endswith('/YouTubeUnstable'):
                    self.assertEqual(before.read(name), after.read(name), name)
            old = bytearray(before.read('Payload/YouTubeUnstable.app/YouTubeUnstable'))
            new = after.read('Payload/YouTubeUnstable.app/YouTubeUnstable')
            info = patcher.parse_macho_info(old)
            # Only explicitly expected, validated ARM64 hook/HDR sites may differ
            # within original __text; segment insertion must preserve all others.
            for hook in patcher.PATCHES + patcher.COBALT_HOOKS:
                _, offset, _, _ = patcher.resolve_patch_site(old, info, hook['entry_va'])
                old[offset:offset+4] = new[offset:offset+4]
            for patch in patcher.COBALT_HDR_PATCHES:
                offset = patcher.va_to_off(info, patch['va'])
                old[offset:offset+4] = new[offset:offset+4]
            start = info['text_off']; end = start + info['text_size']
            self.assertEqual(old[start:end], new[start:end])

if __name__ == '__main__': unittest.main()
