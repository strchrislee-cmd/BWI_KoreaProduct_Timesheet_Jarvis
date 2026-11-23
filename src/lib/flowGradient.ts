// Flowing gradient background (WebGL): today's soft colour pools over a light base, gently
// rippled, drifting steadily from the right edge of the screen to the left like the sea seen from
// high above — one direction only, no back-and-forth. Each pattern (seed) has its own colours,
// pool positions and currents. Rendered at a
// reduced resolution and ~30 fps so it stays cheap under the glass panels. Returns null when
// WebGL is unavailable (the caller shows a still gradient).
import type { GradientScene, Hsl } from './background'

export type FlowSpeedKey = 'slow' | 'normal' | 'fast'

/** Time multiplier per speed setting. */
export const FLOW_RATE: Record<FlowSpeedKey, number> = { slow: 0.5, normal: 1, fast: 2 }

/** Seconds for the currents to drift across one screen width at rate 1. */
const CROSS = 16

/** Seconds for the sea to drift across the screen at a speed (shown next to the speed buttons). */
export function crossSeconds(speed: FlowSpeedKey): number {
  return Math.round(CROSS / FLOW_RATE[speed])
}

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec2 uDir;
uniform vec3 uBase0;
uniform vec3 uBase1;
uniform vec3 uCol[4];
uniform vec2 uPos[4];
uniform vec2 uOffset; // where this pattern starts in the noise field
uniform float uScale; // size of the gentle currents

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = vUv;
  float s = uTime / ${CROSS.toFixed(1)}; // screens travelled; only ever grows, so nothing swings back
  // gentle currents, drifting right -> left a little faster than the colours
  vec2 np = vec2(p.x * uAspect, p.y) * uScale + uOffset + vec2(s * 1.3 * uAspect * uScale, 0.0);
  vec2 w = p + 0.07 * vec2(fbm(np) - 0.44, fbm(np + vec2(4.1, 7.3)) - 0.44);
  float g = dot(w - 0.5, uDir) / (0.5 * (abs(uDir.x) + abs(uDir.y))) * 0.5 + 0.5;
  vec3 col = mix(uBase0, uBase1, clamp(g, 0.0, 1.0));
  for (int i = 0; i < 4; i++) {
    // colour pools move right -> left and come back in from the right edge (seamless wrap)
    vec2 c = vec2(fract(uPos[i].x - s), uPos[i].y);
    float a = 0.0;
    for (int k = -1; k <= 1; k++) {
      vec2 d = w - c - vec2(float(k), 0.0);
      d.x *= uAspect;
      a = max(a, 1.0 - smoothstep(0.0, 0.62, length(d)));
    }
    col = mix(col, uCol[i], 0.85 * a);
  }
  // dither: wide, soft gradients would otherwise show bands on 8-bit screens
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(clamp(col + (n - 0.5) / 255.0, 0.0, 1.0), 1.0);
}
`

export function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

export interface FlowOptions {
  scene: GradientScene
  rate: number
  /** false: draw one still frame */
  animate: boolean
  paused: boolean
}

export interface FlowHandle {
  update(opts: FlowOptions): void
  destroy(): void
}

/** Debug info on the canvas element (read by browser tests). */
export interface FlowDebug {
  frames: number
  time: number
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null
}

export function startFlow(canvas: HTMLCanvasElement, initial: FlowOptions, cfg: { scale: number; fps: number }): FlowHandle | null {
  const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const prog = gl.createProgram()
  if (!vs || !fs || !prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(prog, name)
  const uTime = u('uTime')
  const uAspect = u('uAspect')

  let opts = initial
  const debug: FlowDebug = { frames: 0, time: 0 }
  ;(canvas as HTMLCanvasElement & { flowDebug?: FlowDebug }).flowDebug = debug

  const setScene = (scene: GradientScene) => {
    const rad = (scene.angle * Math.PI) / 180
    gl.uniform2f(u('uDir'), Math.sin(rad), Math.cos(rad)) // CSS angle: 0° = towards the top
    gl.uniform3fv(u('uBase0'), hslToRgb(scene.baseHsl[0]))
    gl.uniform3fv(u('uBase1'), hslToRgb(scene.baseHsl[1]))
    gl.uniform3fv(u('uCol'), scene.blobs.flatMap((b) => hslToRgb(b.hsl)))
    gl.uniform2fv(u('uPos'), scene.blobs.flatMap((b) => [b.x / 100, 1 - b.y / 100]))
    gl.uniform2fv(u('uOffset'), scene.sea.offset)
    gl.uniform1f(u('uScale'), scene.sea.scale)
  }

  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * cfg.scale))
    const h = Math.max(1, Math.round(canvas.clientHeight * cfg.scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    gl.uniform1f(uAspect, w / h)
  }

  const draw = () => {
    gl.uniform1f(uTime, debug.time)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    debug.frames++
  }

  let raf = 0
  let last = 0
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (!last) last = now
    const dt = now - last
    if (dt < 1000 / cfg.fps - 2) return
    last = now
    debug.time += Math.min(dt, 100) / 1000 * opts.rate // integrate, so speed changes never jump
    draw()
  }
  const run = () => {
    cancelAnimationFrame(raf)
    raf = 0
    last = 0
    if (opts.animate && !opts.paused) raf = requestAnimationFrame(loop)
  }

  const ro = new ResizeObserver(() => {
    resize()
    draw()
  })
  ro.observe(canvas)

  setScene(opts.scene)
  resize()
  draw()
  run()

  return {
    update(next) {
      if (next.scene !== opts.scene) setScene(next.scene)
      opts = next
      draw()
      run()
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
