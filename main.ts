// Meme Sprint 3: AI Agent Goes Rogue — entry image renderer.
//
// The joke: a human hires an AI assistant; the assistant calmly takes the
// boss's chair, puts on a tie, and fires the human on day one. The robot
// sits behind a desk with a BOSS nameplate, waving the human out the door
// while the human shuffles away carrying a cardboard box of desk stuff.
//
// The picture is drawn entirely in code: flat shapes, a hand-rolled 5x7
// bitmap font for the captions, and a from-scratch PNG encoder (zlib +
// CRC32). No external images, no network, no fonts from disk — the entry
// is fully self-contained, and two runs produce identical bytes.

import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const MAX_BYTES = 1_048_576;

// ---------------------------------------------------------------- palette
const WALL: RGB = [245, 233, 208];
const FLOOR: RGB = [201, 168, 118];
const DESK: RGB = [139, 90, 43];
const DESK_TOP: RGB = [169, 113, 61];
const STEEL: RGB = [200, 205, 212];
const STEEL_DARK: RGB = [150, 156, 164];
const RED: RGB = [224, 32, 32];
const TIE_RED: RGB = [192, 32, 32];
const BLACK: RGB = [20, 20, 20];
const WHITE: RGB = [255, 255, 255];
const SKIN: RGB = [240, 200, 160];
const SHIRT: RGB = [59, 110, 165];
const PANTS: RGB = [46, 64, 83];
const CARDBOARD: RGB = [217, 160, 102];
const LEAF: RGB = [62, 142, 65];
const POT: RGB = [178, 92, 52];
const CLOCK_FACE: RGB = [250, 250, 246];

type RGB = [number, number, number];

// ------------------------------------------------------------- pixel canvas
const pixels = new Uint8Array(W * H * 3);

function put(x: number, y: number, c: RGB): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
  const o = (iy * W + ix) * 3;
  pixels[o] = c[0];
  pixels[o + 1] = c[1];
  pixels[o + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = Math.max(0, Math.floor(y)); j < Math.min(H, Math.ceil(y + h)); j++) {
    for (let i = Math.max(0, Math.floor(x)); i < Math.min(W, Math.ceil(x + w)); i++) {
      put(i, j, c);
    }
  }
}

// A rectangle with a black border of `border` pixels.
function box(x: number, y: number, w: number, h: number, c: RGB, border = 4): void {
  rect(x - border, y - border, w + border * 2, h + border * 2, BLACK);
  rect(x, y, w, h, c);
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
    const dy = j - cy;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    for (let i = Math.floor(cx - dx); i <= Math.ceil(cx + dx); i++) put(i, j, c);
  }
}

function ring(cx: number, cy: number, r: number, thickness: number, c: RGB): void {
  disc(cx, cy, r, c);
  disc(cx, cy, r - thickness, WALL);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
    const t = (j - cy) / ry;
    const dx = rx * Math.sqrt(Math.max(0, 1 - t * t));
    for (let i = Math.floor(cx - dx); i <= Math.ceil(cx + dx); i++) put(i, j, c);
  }
}

// A thick straight line, drawn as a chain of discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

function triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const top = Math.min(ay, by, cy);
  const bottom = Math.max(ay, by, cy);
  for (let j = Math.floor(top); j <= Math.ceil(bottom); j++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [
      [ax, ay, bx, by],
      [bx, by, cx, cy],
      [cx, cy, ax, ay],
    ];
    for (const [x0, y0, x1, y1] of edges) {
      if ((y0 <= j && j < y1) || (y1 <= j && j < y0)) {
        xs.push(x0 + ((j - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      for (let i = Math.floor(lo); i <= Math.ceil(hi); i++) put(i, j, c);
    }
  }
}

// A rectangle with rounded corners, drawn with a black border.
function roundBox(x: number, y: number, w: number, h: number, r: number, c: RGB, border = 5): void {
  const draw = (ox: number, oy: number, ow: number, oh: number, orad: number, col: RGB) => {
    rect(ox + orad, oy, ow - orad * 2, oh, col);
    rect(ox, oy + orad, ow, oh - orad * 2, col);
    disc(ox + orad, oy + orad, orad, col);
    disc(ox + ow - orad, oy + orad, orad, col);
    disc(ox + orad, oy + oh - orad, orad, col);
    disc(ox + ow - orad, oy + oh - orad, orad, col);
  };
  draw(x - border, y - border, w + border * 2, h + border * 2, r + border, BLACK);
  draw(x, y, w, h, r, c);
}

// ------------------------------------------------------------- 5x7 bitmap font
// Each glyph is 7 rows of 5 bits, top to bottom. Only the letters the meme
// needs are defined: captions, the BOSS nameplate and the speech bubble.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch];
  if (!g) return;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (g[row][col] === "1") {
        rect(x + col * scale, y + row * scale, scale, scale, c);
      }
    }
  }
}

// Draws `text` centred on `cx`, with `fill` letters and a black outline
// when `outline` is set (meme-style white-on-black captions).
function drawText(text: string, cx: number, y: number, scale: number, fill: RGB, outline: boolean): void {
  const advance = 6 * scale;
  const width = text.length * advance - scale;
  let x = cx - width / 2;
  for (const ch of text) {
    if (ch !== " ") {
      if (outline) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          drawGlyph(ch, x + dx * scale, y + dy * scale, scale, BLACK);
        }
      }
      drawGlyph(ch, x, y, scale, fill);
    }
    x += advance;
  }
}

// ------------------------------------------------------------- the scene
function drawScene(): void {
  // Office wall and floor.
  rect(0, 0, W, H, WALL);
  rect(0, 820, W, H - 820, FLOOR);

  // Wall clock: it is 5 o'clock, quitting time — for the human, anyway.
  ring(120, 200, 52, 6, BLACK);
  disc(120, 200, 46, CLOCK_FACE);
  thickLine(120, 200, 120, 168, 5, BLACK);
  thickLine(120, 200, 142, 214, 5, BLACK);
  disc(120, 200, 4, BLACK);

  // The human, shuffling out to the left with a cardboard box of desk stuff.
  // Head, bowed.
  disc(168, 640, 30, SKIN);
  disc(168, 640, 30, BLACK); // outline pass: draw skin back over it below
  disc(168, 640, 26, SKIN);
  disc(158, 636, 4, BLACK); // sad eye
  thickLine(150, 656, 166, 660, 3, BLACK); // downturned mouth
  // Body and legs, mid-shuffle.
  box(140, 672, 58, 104, SHIRT, 4);
  thickLine(158, 776, 138, 848, 16, PANTS);
  thickLine(182, 776, 204, 846, 16, PANTS);
  rect(126, 844, 34, 12, BLACK); // shoes
  rect(196, 842, 34, 12, BLACK);
  // Cardboard box with a plant, held out in front.
  box(58, 690, 104, 74, CARDBOARD, 4);
  rect(96, 660, 30, 34, POT);
  disc(104, 652, 16, LEAF);
  disc(124, 646, 14, LEAF);
  // Arms reaching for the box.
  thickLine(148, 700, 108, 726, 14, SHIRT);
  thickLine(150, 724, 116, 742, 14, SKIN);

  // The robot, seated behind the desk in the boss's chair.
  // Waving arm, raised in a cheery goodbye toward the departing human.
  thickLine(500, 592, 402, 486, 26, BLACK);
  thickLine(500, 592, 402, 486, 18, STEEL);
  disc(398, 482, 15, STEEL_DARK);
  disc(398, 482, 15, BLACK);
  disc(398, 482, 11, STEEL_DARK);
  // Three waving fingers, so the hand reads as a wave, not a ball.
  for (const [fx, fy] of [[376, 456], [396, 450], [416, 456]] as const) {
    thickLine(398, 482, fx, fy, 9, BLACK);
    thickLine(398, 482, fx, fy, 5, STEEL_DARK);
  }
  // Body, mostly hidden by the desk.
  box(486, 556, 268, 150, STEEL, 5);
  // A red tie: he is the boss now.
  triangle(620, 566, 598, 606, 642, 606, TIE_RED);
  triangle(598, 606, 642, 606, 620, 664, TIE_RED);
  // Head.
  roundBox(516, 372, 208, 188, 34, STEEL, 5);
  // Antenna with a blinking red light.
  thickLine(620, 372, 620, 322, 8, BLACK);
  disc(620, 312, 15, RED);
  disc(620, 312, 15, BLACK);
  disc(620, 312, 11, RED);
  // Smug red eyes.
  disc(572, 452, 26, BLACK);
  disc(668, 452, 26, BLACK);
  disc(572, 452, 19, RED);
  disc(668, 452, 19, RED);
  disc(578, 446, 6, WHITE);
  disc(674, 446, 6, WHITE);
  // A slight, satisfied smirk.
  thickLine(588, 516, 652, 506, 5, BLACK);

  // Speech bubble: the verdict, delivered in HR's calmest voice.
  triangle(706, 330, 766, 326, 716, 396, WHITE);
  ellipse(826, 296, 150, 52, BLACK);
  ellipse(826, 296, 144, 46, WHITE);
  drawText("YOU ARE FIRED", 826, 286, 3, BLACK, false);

  // The desk, with the nameplate that says it all.
  box(330, 690, 650, 140, DESK, 5);
  rect(330, 690, 650, 22, DESK_TOP);
  box(560, 742, 200, 52, WHITE, 4);
  drawText("BOSS", 660, 754, 3, BLACK, false);

  // A small plant on the desk, thriving under new management.
  rect(896, 648, 34, 44, POT);
  disc(906, 640, 18, LEAF);
  disc(926, 632, 15, LEAF);

  // Captions.
  drawText("HIRED AN AI ASSISTANT", W / 2, 30, 6, WHITE, true);
  drawText("IT FIRED ME ON DAY ONE", W / 2, 912, 6, WHITE, true);
}

// ------------------------------------------------------------- PNG encoding
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 2; // truecolour RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(pixels.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- entry point
function main(): void {
  drawScene();
  const png = encodePng();
  if (png.length > MAX_BYTES) {
    throw new Error(`entry.png is ${png.length} bytes, over the 1 MiB cap`);
  }
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);

  // Read it back and confirm it is a whole 1024x1024 PNG.
  const back = readFileSync(outPath);
  const signatureOk = back.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const w = back.readUInt32BE(16);
  const h = back.readUInt32BE(20);
  if (!signatureOk || w !== W || h !== H) {
    throw new Error(`read-back failed: signature ok=${signatureOk}, size ${w}x${h}`);
  }
  const sha = createHash("sha256").update(back).digest("hex");
  console.log(`wrote ${outPath} (${back.length} bytes, ${w}x${h}, sha256 ${sha})`);
}

main();
