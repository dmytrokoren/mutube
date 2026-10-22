#!/usr/bin/env python3
"""Refresh the upstream release reference; does not replace native/user-script code."""
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = 'https://api.github.com/repos/reisxd/TizenTubeCobalt/releases/latest'


def main():
    request = urllib.request.Request(URL, headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'MuTube-release-reference'
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        release = json.load(response)
    tag = release.get('tag_name', '')
    if not isinstance(tag, str) or not re.fullmatch(r'v?\d+\.\d+\.\d+', tag):
        raise ValueError('Official release response has no valid stable version')
    version = tag.removeprefix('v')
    target = Path(__file__).resolve().parents[1] / 'vendor/mods/cobaltRelease.js'
    original = target.read_text()
    match = re.search(r"export const cobaltVersion = '([^']+)';", original)
    if not match:
        raise ValueError('Cannot locate the version reference; source file left unchanged')
    if match.group(1) == version:
        print('Already tracks TizenTube Cobalt ' + version)
        return
    target.write_text(
        '// Upstream Cobalt release reference: https://github.com/reisxd/TizenTubeCobalt/releases/tag/v' + version + '\n'
        '// This is not the version of the YouTube IPA\'s installed tvOS Cobalt engine.\n'
        "export const cobaltVersion = '" + version + "';\n"
        "export const cobaltReleaseUrl = '" + URL + "';\n"
    )
    print('Updated Cobalt release reference: ' + match.group(1) + ' -> ' + version)
    print('This changes the displayed release reference only, not the bundled engine or userscript.')
    print('Next: make userscript && make clean && make')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Release reference refresh failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
