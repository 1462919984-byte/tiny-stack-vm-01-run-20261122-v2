// Tiny stack ISA v1 interpreter: 32-bit wrapping arithmetic, 256-value stack, calls, memory, traps.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const E = new TextEncoder();
function run(p: Uint8Array, q: Uint8Array) {
  const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), O = new Uint8Array(65536);
  let s = 0, c = 0, l = 0, ip = 0, pc = 0, t = 0;
  const X = (e: number) => ({ out: O.slice(0, l), exit: e });
  for (;;) {
    if (t === 1e6) return X(10);
    if (pc < 0 || pc >= n) return X(9);
    const o = p[pc];
    let i = 0, po = 0, pu = 0;
    switch (o) {
      case 1: i = 1; pu = 1; break;
      case 2: i = 4; pu = 1; break;
      case 3: po = 1; break;
      case 4: po = 1; pu = 2; break;
      case 5: po = 2; pu = 2; break;
      case 6: po = 2; pu = 3; break;
      case 7: po = 3; pu = 3; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34:
        po = 2; pu = 1; break;
      case 23: case 27: po = 1; pu = 1; break;
      case 48: i = 2; break;
      case 49: case 50: i = 2; po = 1; break;
      case 51: i = 2; break;
      case 52: break;
      case 64: po = 1; pu = 1; break;
      case 65: po = 2; break;
      case 80: case 81: case 83: po = 1; break;
      case 82: pu = 1; break;
      default: return X(5);
    }
    if (pc + i >= n) return X(9);
    t++;
    const nx = pc + 1 + i;
    if (s < po) return X(2);
    if (s - po + pu > 256) return X(3);
    pc = nx;
    switch (o) {
      case 0: return X(0);
      case 1: D[s++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[s++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: s--; break;
      case 4: D[s] = D[s - 1]; s++; break;
      case 5: { const a = D[s - 1]; D[s - 1] = D[s - 2]; D[s - 2] = a; break; }
      case 6: D[s] = D[s - 2]; s++; break;
      case 7: { const a = D[s - 3]; D[s - 3] = D[s - 2]; D[s - 2] = D[s - 1]; D[s - 1] = a; break; }
      case 23: D[s - 1] = -D[s - 1] | 0; break;
      case 27: D[s - 1] = ~D[s - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = D[s - 1], a = D[s - 2]; let r = 0;
        switch (o) {
          case 16: r = (a + b) | 0; break;
          case 17: r = (a - b) | 0; break;
          case 18: r = Math.imul(a, b); break;
          case 19: if (!b) return X(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 20: if (!b) return X(4); r = b === -1 ? 0 : a % b | 0; break;
          case 21: if (!b) return X(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 22: if (!b) return X(4); r = (a >>> 0) % (b >>> 0) | 0; break;
          case 24: r = a & b; break;
          case 25: r = a | b; break;
          case 26: r = a ^ b; break;
          case 28: r = a << (b & 31); break;
          case 29: r = a >> (b & 31); break;
          case 30: r = (a >>> (b & 31)) | 0; break;
          case 32: r = a === b ? 1 : 0; break;
          case 33: r = a < b ? 1 : 0; break;
          case 34: r = a >>> 0 < b >>> 0 ? 1 : 0; break;
        }
        s -= 2; D[s++] = r; break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let go = true;
        if (o !== 48) { const v = D[--s]; go = o === 49 ? v === 0 : v !== 0; }
        if (go) pc = nx + rel;
        break;
      }
      case 51:
        if (c === 64) return X(7);
        C[c++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52:
        if (!c) return X(8);
        pc = C[--c]; break;
      case 64: {
        const a = D[s - 1];
        if (a < 0 || a >= 256) return X(6);
        D[s - 1] = M[a]; break;
      }
      case 65: {
        const a = D[s - 1], v = D[s - 2];
        if (a < 0 || a >= 256) return X(6);
        s -= 2; M[a] = v; break;
      }
      case 80: {
        const b = E.encode(String(D[s - 1]));
        if (l + b.length > 65536) return X(11);
        s--; O.set(b, l); l += b.length; break;
      }
      case 81:
        if (l + 1 > 65536) return X(11);
        O[l++] = D[--s] & 255; break;
      case 82: D[s++] = ip < q.length ? q[ip++] : -1; break;
      case 83: return X(D[--s] & 255);
    }
  }
}
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.exit + '\n');
}
