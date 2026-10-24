/**
 * A small granular pitch shifter (two crossfaded taps sweeping through a
 * delay line) as an AudioWorklet. Used for MASTER TEMPO (keylock: undo the
 * pitch change that comes with a tempo change), KEY SHIFT / KEY SYNC and the
 * mic PITCH effect. At ratio 1 it passes the input straight through.
 *
 * ponytail: plain delay-line shifter, audible "chorus" at big ratios; swap
 * for a phase vocoder if anyone needs ±12 semitones to sound clean.
 */
const source = `
class Shifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.size = 4096;
    this.win = 1536;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.ph = 0;
  }
  read(d) {
    let p = this.w - d;
    while (p < 0) p += this.size;
    const i = Math.floor(p);
    const f = p - i;
    return this.buf[i % this.size] * (1 - f) + this.buf[(i + 1) % this.size] * f;
  }
  process(inputs, outputs, params) {
    const input = inputs[0][0];
    const out = outputs[0];
    const r = params.ratio[0];
    const n = out[0].length;
    for (let i = 0; i < n; i++) {
      const x = input ? input[i] : 0;
      this.buf[this.w] = x;
      let y = x;
      if (Math.abs(r - 1) > 1e-3) {
        this.ph = (this.ph + (1 - r) / this.win + 1) % 1;
        const p2 = (this.ph + 0.5) % 1;
        const g1 = Math.sin(Math.PI * this.ph) ** 2;
        y = this.read(this.ph * this.win) * g1 + this.read(p2 * this.win) * (1 - g1);
      }
      for (const ch of out) ch[i] = y;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}
registerProcessor('shifter', Shifter);
`;

export async function loadShifter(ctx: AudioContext) {
  const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
}

export const shifter = (ctx: AudioContext) => new AudioWorkletNode(ctx, 'shifter', { outputChannelCount: [1] });
