import { HEX_SHAPE as k, HEX_SPEED } from './hex-field.js';

/**
 * GLSL ES 3.0 for the hex field. One full-screen triangle strip with no
 * buffers (gl_VertexID, as in DitheredAvatar) and one small fragment shader:
 * a nearest-cell lookup, one SDF, a few sines. The field's numbers are
 * written in from HEX_SHAPE and its colours arrive as uniforms read from the
 * CSS tokens, so the shader holds neither of its own.
 */

/** A GLSL float literal: GLSL rejects `1` where it wants `1.0`, and
 *  `1 - 0.65` would otherwise print as 0.35000000000000003. */
const f = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

export const vertexShader = `#version 300 es
const vec2 corners[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}
`;

export const fragmentShader = `#version 300 es
precision highp float;

uniform vec2 u_res;     // drawing buffer, device px
uniform float u_px;     // device px per CSS px
uniform float u_time;   // seconds on the card's clock
uniform float u_cols;   // cells across the card
uniform vec2 u_dir;     // wave direction
uniform float u_phase;
uniform vec2 u_node;    // the focus cell's centre, in cells
uniform vec3 u_bg;      // --story-card
uniform vec3 u_ink;     // --story-accent
uniform vec3 u_accent;  // --story-accent-secondary

out vec4 fragColor;

const float SQ3 = 1.7320508;

// iq's hexagon SDF read with its axes swapped, so the points face up like the
// brand hex. r is the inradius.
float sdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
  p = abs(p.yx);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

// A hex rounded by m until it is a circle: the hex shrinks as the rounding grows.
float sdMorph(vec2 p, float r, float m) {
  return sdHex(p, r * (1.0 - m)) - r * m;
}

// Nearest cell of the pointy-top lattice (hexCentre in hex-field.ts): xy is
// the offset from its centre, zw the centre.
vec4 hexCell(vec2 p) {
  const vec2 s = vec2(1.0, SQ3);
  const vec2 o = vec2(0.5, SQ3 * 0.5);
  vec2 a = (floor(p / s) + 0.5) * s;
  vec2 b = (floor((p - o) / s) + 0.5) * s + o;
  vec2 da = p - a;
  vec2 db = p - b;
  return dot(da, da) < dot(db, db) ? vec4(da, a) : vec4(db, b);
}

void main() {
  float unit = u_res.x / u_cols;                       // device px per cell
  vec4 h = hexCell((gl_FragCoord.xy - 0.5 * u_res) / unit);
  vec2 q = h.xy;
  vec2 c = h.zw;
  float t = u_time * ${f(HEX_SPEED)};

  // hexCell() in hex-field.ts, term for term.
  float dn = length(c - u_node);
  float wave = ${f(k.waveWeight)} * sin(dot(c, u_dir) * ${f(k.waveK)} - t + u_phase)
             + ${f(1 - k.waveWeight)} * sin(dn * ${f(k.rippleK)} - t * ${f(k.rippleSpeed)});
  float m = smoothstep(-${f(k.edge)}, ${f(k.edge)}, wave);
  float clearing = smoothstep(${f(k.clearFrom)}, ${f(k.clearTo)}, dn);
  float r = mix(${f(k.rHex)}, ${f(k.rCircle)}, m) * mix(${f(k.clearScale)}, 1.0, clearing);
  float ink = mix(${f(k.inkHex)}, ${f(k.inkCircle)}, m) * clearing;

  float aa = 1.0 / unit;                               // one device px, in cells
  float hw = 0.5 * u_px / unit;                        // half a 1 CSS px stroke
  float d = sdMorph(q, r, m);
  float stroke = 1.0 - smoothstep(hw - 0.5 * aa, hw + 0.5 * aa, abs(d));
  vec3 col = mix(u_bg, u_ink, stroke * ink);

  // The focus (hexNode): its own slower morph, a heavier outline, a faint fill.
  float mn = smoothstep(-${f(k.nodeEdge)}, ${f(k.nodeEdge)}, sin(t * ${f(k.nodeSpeed)} + ${f(k.nodePhase)}));
  float dNode = sdMorph(q, ${f(k.nodeR)}, mn);
  float nodeHw = ${f(k.nodeLine)} * hw;
  float nodeLine = 1.0 - smoothstep(nodeHw - 0.5 * aa, nodeHw + 0.5 * aa, abs(dNode));
  float nodeFill = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dNode);
  float isNode = 1.0 - step(0.01, dn);
  col = mix(col, u_accent, isNode * max(nodeLine, nodeFill * ${f(k.nodeFill)}));

  fragColor = vec4(col, 1.0);
}
`;
