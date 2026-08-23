#!/usr/bin/env python3
# /// script
# requires-python = ">=3.14"
# dependencies = [
#   "capstone>=5.0.6",
#   "lief>=0.17.3",
# ]
# ///

import argparse
import io
import plistlib
import struct
import zipfile
from pathlib import Path

import lief
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN

MD = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
MD.detail = False

INTERESTING_STRINGS = [
    b"HTMLScriptElement",
    b"DirectiveList",
    b"AddDirective",
    b"ContentSecurityPolicy",
    b"Execute",
    b"Cobalt",
    b"yttv",
    b"youtube.com/tv",
]

INTERESTING_SYMBOLS = {
    "std::string::find": "__ZNKSt3__112basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE4findEPKcmm",
    "std::string::insert": "__ZNSt3__112basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6insertEmPKcm",
    "strstr": "_strstr",
    "memcmp": "_memcmp",
    "strlen": "_strlen",
    "memmem": "_memmem",
    "strnstr": "_strnstr",
    "objc_getClass": "_objc_getClass",
    "objc_msgSend": "_objc_msgSend",
    "dlsym": "_dlsym",
    "printf": "_printf",
}

OLD_VAS = {
    "htmlscript": 0x100EBD830,
    "csp": 0x101515AC8,
    "cobalt_vp9_profile2_support": 0x101180894,
    "cobalt_display_criteria_gate": 0x101142BE4,
    "cobalt_vp9_hdr_hw_gate": 0x10114F840,
    "cobalt_vp9_hdr_4k60_gate": 0x10114F870,
}


def parse_macho(data: bytes):
    tmp = Path("/tmp/mutube-analysis-macho")
    tmp.write_bytes(data)
    binary = lief.parse(str(tmp))
    try:
        tmp.unlink()
    except FileNotFoundError:
        pass

    text = binary.get_section("__text")
    stubs = binary.get_section("__stubs")
    text_seg = next((s for s in binary.segments if s.name == "__TEXT"), None)
    dysym = next((c for c in binary.commands if type(c).__name__ == "DynamicSymbolCommand"), None)

    if not text or not stubs or not text_seg or not dysym:
        raise RuntimeError("Required Mach-O structures missing")

    return binary, {
        "text_va": text.virtual_address,
        "text_off": text.offset,
        "text_size": text.size,
        "text_seg_va": text_seg.virtual_address,
        "text_seg_off": text_seg.file_offset,
        "stubs": stubs,
        "dysym": dysym,
    }


def stub_symbols(info):
    stubs = info["stubs"]
    dysym = info["dysym"]
    stub_size = stubs.reserved2
    if not stub_size:
        return []

    out = []
    count = stubs.size // stub_size
    for i in range(count):
        try:
            sym = dysym.indirect_symbols[stubs.reserved1 + i]
        except Exception:
            continue
        name = getattr(sym, "name", None)
        if name:
            out.append((name, stubs.virtual_address + i * stub_size))
    return out


def va_to_off(info, va):
    off = info["text_off"] + (va - info["text_va"])
    if off < info["text_off"] or off >= info["text_off"] + info["text_size"]:
        return None
    return off


def disasm_window(data, info, center_va, before=5, after=8):
    start_va = center_va - before * 4
    start_off = va_to_off(info, start_va)
    if start_off is None:
        return ["  [out of __text bounds]"]

    size = (before + after + 1) * 4
    blob = data[start_off:start_off + size]
    lines = []
    for ins in MD.disasm(blob, start_va):
        mark = "=>" if ins.address == center_va else "  "
        lines.append(f"{mark} 0x{ins.address:016x}  {ins.mnemonic:<8} {ins.op_str}")
    return lines


def decode_bl_target(insn_word, pc):
    if (insn_word & 0xFC000000) != 0x94000000:
        return None
    imm26 = insn_word & 0x03FFFFFF
    if imm26 & (1 << 25):
        imm26 -= 1 << 26
    return pc + (imm26 << 2)


def find_bl_refs(data, info, target_va, max_results=40):
    refs = []
    off = info["text_off"]
    end = off + info["text_size"]
    va = info["text_va"]

    while off + 4 <= end:
        word = struct.unpack_from("<I", data, off)[0]
        target = decode_bl_target(word, va)
        if target == target_va:
            refs.append(va)
            if len(refs) >= max_results:
                break
        off += 4
        va += 4
    return refs


def find_bytes(data, needle, max_results=16):
    out = []
    pos = 0
    while len(out) < max_results:
        pos = data.find(needle, pos)
        if pos < 0:
            break
        out.append(pos)
        pos += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ipa", required=True)
    ap.add_argument("--out", default="mutube-analysis.txt")
    args = ap.parse_args()

    ipa_path = Path(args.ipa)
    report = io.StringIO()

    def p(s=""):
        print(s, file=report)

    with zipfile.ZipFile(ipa_path, "r") as z:
        infos = z.infolist()
        plist_info = next(
            (
                i for i in infos
                if i.filename.startswith("Payload/")
                and i.filename.count("/") == 2
                and i.filename.endswith(".app/Info.plist")
            ),
            None,
        )
        if not plist_info:
            raise RuntimeError("Payload/*.app/Info.plist not found")

        plist = plistlib.loads(z.read(plist_info.filename))
        app_dir = plist_info.filename.rsplit("/", 1)[0]
        executable = plist.get("CFBundleExecutable")
        executable_path = f"{app_dir}/{executable}"
        bin_info = next((i for i in infos if i.filename == executable_path), None)
        if not bin_info:
            raise RuntimeError(f"Executable not found: {executable_path}")

        data = z.read(bin_info.filename)

    _, info = parse_macho(data)
    symbols = stub_symbols(info)
    sym_map = dict(symbols)

    p("=" * 88)
    p("μTube / YouTube tvOS analysis report")
    p("=" * 88)
    p(f"Version:       {plist.get('CFBundleShortVersionString')}")
    p(f"Build:         {plist.get('CFBundleVersion')}")
    p(f"Bundle ID:     {plist.get('CFBundleIdentifier')}")
    p(f"App bundle:    {app_dir}")
    p(f"Executable:    {executable}")
    p(f"Binary size:   {len(data)} bytes")
    p(f"__text VA:     0x{info['text_va']:x}")
    p(f"__text offset: 0x{info['text_off']:x}")
    p(f"__text size:   0x{info['text_size']:x} ({info['text_size']} bytes)")
    p(f"Imported stubs:{len(symbols)}")
    p()

    p("=" * 88)
    p("Interesting imported symbols")
    p("=" * 88)
    for label, name in INTERESTING_SYMBOLS.items():
        va = sym_map.get(name)
        if va is None:
            p(f"MISSING  {label:<24} {name}")
        else:
            p(f"FOUND    {label:<24} 0x{va:x}  {name}")
    p()

    p("=" * 88)
    p("Interesting raw strings")
    p("=" * 88)
    for needle in INTERESTING_STRINGS:
        hits = find_bytes(data, needle)
        label = needle.decode("ascii", "replace")
        if hits:
            p(f"FOUND    {label:<28} " + ", ".join(f"0x{x:x}" for x in hits))
        else:
            p(f"MISSING  {label}")
    p()

    p("=" * 88)
    p("Old μTube 4.54.01 virtual addresses in this binary")
    p("=" * 88)
    for name, va in OLD_VAS.items():
        p(f"[{name}] 0x{va:x}")
        for line in disasm_window(data, info, va):
            p(line)
        p()

    p("=" * 88)
    p("Direct BL references to interesting imported functions")
    p("=" * 88)
    scan_labels = [
        "std::string::insert",
        "strstr",
        "memcmp",
        "strlen",
        "objc_getClass",
        "objc_msgSend",
        "dlsym",
    ]

    for label in scan_labels:
        symbol = INTERESTING_SYMBOLS[label]
        target_va = sym_map.get(symbol)
        p()
        p(f"[{label}] {symbol}")
        if target_va is None:
            p("  symbol unavailable")
            continue

        p(f"  stub VA: 0x{target_va:x}")
        refs = find_bl_refs(data, info, target_va)
        p(f"  direct BL refs found: {len(refs)}")
        for idx, ref in enumerate(refs[:20], 1):
            p()
            p(f"  Candidate {idx}: call site 0x{ref:x}")
            for line in disasm_window(data, info, ref, before=10, after=12):
                p("  " + line)

    p()
    p("=" * 88)
    p("C++ / string-related imported stubs")
    p("=" * 88)
    keywords = ("string", "find", "insert", "char_traits", "memcmp", "strlen", "strstr")
    matches = [(name, va) for name, va in symbols if any(k in name.lower() for k in keywords)]
    for name, va in matches[:500]:
        p(f"0x{va:x}  {name}")
    if len(matches) > 500:
        p(f"... {len(matches) - 500} more omitted")

    Path(args.out).write_text(report.getvalue(), encoding="utf-8")
    print(f"Wrote analysis report: {args.out}")


if __name__ == "__main__":
    main()
