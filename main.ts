// tiny-stack-vm-01 entry: an interpreter of make.fun's tiny stack ISA that runs every
// instance and writes exactly the reference VM's output bytes and exit code.
// Trap codes (ISA.md "Traps"): 2 underflow, 3 overflow, 4 div-zero, 5 bad opcode,
// 6 memory, 7 call-depth, 8 RET-empty, 9 pc/immediate, 10 step limit, 11 output limit.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_MAX = 256, CALLS_MAX = 64, MEMORY_WORDS = 256;
const STEP_LIMIT = 1_000_000, OUTPUT_MAX = 65_536;
const enc = new TextEncoder();

// [immediate bytes, values popped, values pushed] for each valid opcode (null: unknown).
function meta(op) {
  switch (op) {
    case 0x00: return [0, 0, 0];                 // HALT
    case 0x01: return [1, 0, 1];                 // PUSH8
    case 0x02: return [4, 0, 1];                 // PUSH32
    case 0x03: return [0, 1, 0];                 // POP
    case 0x04: return [0, 1, 2];                 // DUP
    case 0x05: return [0, 2, 2];                 // SWAP
    case 0x06: return [0, 2, 3];                 // OVER
    case 0x07: return [0, 3, 3];                 // ROT
    case 0x10: case 0x11: case 0x12:             // ADD SUB MUL
    case 0x13: case 0x14: case 0x15: case 0x16:  // DIV MOD DIVU MODU
    case 0x18: case 0x19: case 0x1a:             // AND OR XOR
    case 0x1c: case 0x1d: case 0x1e:             // SHL SHR SHRU
    case 0x20: case 0x21: case 0x22: return [0, 2, 1]; // EQ LT LTU
    case 0x17: case 0x1b: return [0, 1, 1];      // NEG NOT
    case 0x30: return [2, 0, 0];                 // JMP
    case 0x31: case 0x32: return [2, 1, 0];      // JZ JNZ
    case 0x33: return [2, 0, 0];                 // CALL
    case 0x34: return [0, 0, 0];                 // RET
    case 0x40: return [0, 1, 1];                 // LOAD
    case 0x41: return [0, 2, 0];                 // STORE
    case 0x50: return [0, 1, 0];                 // PRINT
    case 0x51: return [0, 1, 0];                 // PUTC
    case 0x52: return [0, 0, 1];                 // IN
    case 0x53: return [0, 1, 0];                 // EXIT
    default: return null;
  }
}

function run(prog, input) {
  const n = prog.length;
  const D = new Int32Array(STACK_MAX);
  let sp = 0;
  const C = new Int32Array(CALLS_MAX);
  let csp = 0;
  const M = new Int32Array(MEMORY_WORDS);
  const out = new Uint8Array(OUTPUT_MAX);
  let olen = 0, inPos = 0, pc = 0, steps = 0;
  const trap = (code) => ({ out: out.slice(0, olen), exit: code });
  for (;;) {
    if (steps === STEP_LIMIT) return trap(10);
    if (pc < 0 || pc >= n) return trap(9);
    const op = prog[pc];
    const m = meta(op);
    if (m === null) return trap(5);
    const imm = m[0], pops = m[1], pushes = m[2];
    if (pc + imm >= n) return trap(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return trap(2);
    if (sp - pops + pushes > STACK_MAX) return trap(3);
    pc = next;
    switch (op) {
      case 0x00: return { out: out.slice(0, olen), exit: 0 };
      case 0x01: D[sp++] = (prog[next - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = prog[next - 4] | (prog[next - 3] << 8) | (prog[next - 2] << 16) | (prog[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: if (b === 0) return trap(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 0x14: if (b === 0) return trap(4); r = b === -1 ? 0 : (a % b) | 0; break;
          case 0x15: if (b === 0) return trap(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16: if (b === 0) return trap(4); r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          case 0x22: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
        }
        sp -= 2; D[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((prog[next - 2] | (prog[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33: if (csp === CALLS_MAX) return trap(7); C[csp++] = next; pc = prog[next - 2] | (prog[next - 1] << 8); break;
      case 0x34: if (csp === 0) return trap(8); pc = C[--csp]; break;
      case 0x40: { const addr = D[sp - 1]; if (addr < 0 || addr >= MEMORY_WORDS) return trap(6); D[sp - 1] = M[addr]; break; }
      case 0x41: { const addr = D[sp - 1], v = D[sp - 2]; if (addr < 0 || addr >= MEMORY_WORDS) return trap(6); sp -= 2; M[addr] = v; break; }
      case 0x50: { const bytes = enc.encode(String(D[sp - 1])); if (olen + bytes.length > OUTPUT_MAX) return trap(11); sp--; out.set(bytes, olen); olen += bytes.length; break; }
      case 0x51: if (olen + 1 > OUTPUT_MAX) return trap(11); out[olen++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = inPos < input.length ? input[inPos++] : -1; break;
      case 0x53: return { out: out.slice(0, olen), exit: D[--sp] & 255 };
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const prog = new Uint8Array(readFileSync(join(I, id, 'program.bin')));
  const input = new Uint8Array(readFileSync(join(I, id, 'input.bin')));
  const r = run(prog, input);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.exit + '\n');
}
