/**
 * Patch a PE (.exe) file to use the Windows GUI subsystem instead of CUI.
 * This prevents a console window from appearing when the EXE is double-clicked.
 *
 * PE optional header layout (32-bit and 64-bit):
 *   - PE signature at file offset [0x3C] (4 bytes, little-endian)
 *   - COFF header: PE signature + 4 bytes (20 bytes)
 *   - PE optional header: PE signature + 4 + 20 bytes
 *   - Subsystem field: PE optional header + 68 bytes (2-byte little-endian)
 *     = file offset [0x3C] + 4 + 20 + 68 = [0x3C] + 92
 */

const fs = require('fs');

const SUBSYSTEM_OFFSET_FROM_PE_SIG = 92;
const SUBSYSTEM_CUI = 3;
const SUBSYSTEM_GUI = 2;

function patchToGui(exePath) {
  const buf = fs.readFileSync(exePath);

  // Read PE signature offset from DOS header at 0x3C
  const peOffset = buf.readUInt32LE(0x3C);

  // Verify PE signature "PE\0\0"
  if (buf.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error(`Invalid PE signature at offset 0x${peOffset.toString(16)}`);
  }

  const subsystemOffset = peOffset + SUBSYSTEM_OFFSET_FROM_PE_SIG;
  const current = buf.readUInt16LE(subsystemOffset);

  if (current === SUBSYSTEM_GUI) {
    console.log(`  Already GUI subsystem: ${exePath}`);
    return;
  }

  if (current !== SUBSYSTEM_CUI) {
    throw new Error(`Unexpected subsystem value ${current} at offset 0x${subsystemOffset.toString(16)}`);
  }

  buf.writeUInt16LE(SUBSYSTEM_GUI, subsystemOffset);
  fs.writeFileSync(exePath, buf);
  console.log(`  Patched to GUI subsystem: ${exePath}`);
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node set-gui-subsystem.js <exe-path>');
  process.exit(1);
}

patchToGui(target);
