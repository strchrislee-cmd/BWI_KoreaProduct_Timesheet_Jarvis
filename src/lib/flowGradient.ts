// Flowing gradient background (WebGL): today's colours lie in soft wavy bands that flow from the
// right edge of the screen to the left. Each pattern (seed) has its own wave shape. Rendered at a
// reduced resolution and ~30 fps — a soft gradient needs no more — so it stays cheap even under
// the glass panels. Returns null when WebGL is unavailable (the caller shows a still gradient).
import { bandColors, type GradientScene, type Hsl } from './background'

export type FlowSpeedKey = 'slow' | 'normal' | 'fast'

/** Time multiplier per speed setting. */
export const FLOW_RATE: Record<FlowSpeedKey, number> = { slow: 0.5, normal: 1, fast: 2 }

/** Seconds for the pattern to travel one screen width at rate 1. */
const CROSS = 12

/** Seconds for the waves to cross the screen at a speed (shown next to the speed buttons). */
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
uniform vec3 uCol[6];
uniform vec2 uK;     // waves per screen width (whole numbers: seamless while scrolling)
uniform vec2 uAmp;   // wave heights
uniform vec2 uPhase;
uniform float uTilt;
const float TAU = 6.2831853;

vec3 band(float f) {
  // 6 colours spread over f = 0..1, smoothly blended
  float x = clamp(f, 0.0, 1.0) * 5.0;
  float i = floor(x);
  float w = smoothstep(0.0, 1.0, fract(x));
  vec3 a = uCol[0]; vec3 b = uCol[1];
  if (i >= 1.0) { a = uCol[1]; b = uCol[2]; }
  if (i >= 2.0) { a = uCol[2]; b = uCol[3]; }
  if (i >= 3.0) { a = uCol[3]; b = uCol[4]; }
  if (i >= 4.0) { a = uCol[4]; b = uCol[5]; }
  if (i >= 5.0) { a = uCol[5]; b = uCol[5]; }
  return mix(a, b, w);
}

void main() {
  vec2 p = vUv;
  float x = p.x + uTime / ${CROSS.toFixed(1)}; // the pattern moves right → left
  float wave = uAmp.x * sin(TAU * uK.x * x + uPhase.x) + uAmp.y * sin(TAU * uK.y * x + uPhase.y);
  vec3 col = band(p.y + wave + uTilt * (p.x - 0.5));
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

  let opts = initial
  const debug: FlowDebug = { frames: 0, time: 0 }
  ;(canvas as HTMLCanvasElement & { flowDebug?: FlowDebug }).flowDebug = debug

  const setScene = (scene: GradientScene) => {
    gl.uniform3fv(u('uCol'), bandColors(scene).flatMap((c: Hsl) => hslToRgb(c)))
    gl.uniform2fv(u('uK'), scene.wave.counts)
    gl.uniform2fv(u('uAmp'), scene.wave.heights)
    gl.uniform2fv(u('uPhase'), scene.wave.phases)
    gl.uniform1f(u('uTilt'), scene.wave.tilt)
  }

  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * cfg.scale))
    const h = Math.max(1, Math.round(canvas.clientHeight * cfg.scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
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
