
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform sampler2D uBackgroundTexture;
  uniform sampler2D uVideoTexture;
  uniform sampler2D uMaskTexture;
  uniform float uRevealFactor;
  uniform vec2 uResolution;
  varying vec2 vUv;

  // --- Simplex Noise Implementation ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                          0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                          -0.577350269189626, // -1.0 + 2.0 * C.x
                          0.024390243902439); // 1.0 / 41.0
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i); 
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
          + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xy + h.yz * x12.zw;
      return 130.0 * dot(m, g);
  }

  void main() {
    float maskVal = texture2D(uMaskTexture, vUv).r;

    // --- High Quality Edge Detection (Sobel-like 8-neighbor) ---
    // Using 8 samples creates a much smoother gradient for the edge than 4 samples
    vec2 px = 1.0 / uResolution;
    // Radius controls the thickness. 5.0 is quite thick.
    float radius = 5.0; 
    vec2 offset = px * radius;

    float n  = texture2D(uMaskTexture, vUv + vec2(0.0, offset.y)).r;
    float s  = texture2D(uMaskTexture, vUv - vec2(0.0, offset.y)).r;
    float e  = texture2D(uMaskTexture, vUv + vec2(offset.x, 0.0)).r;
    float w  = texture2D(uMaskTexture, vUv - vec2(offset.x, 0.0)).r;
    float nw = texture2D(uMaskTexture, vUv + vec2(-offset.x, offset.y)).r;
    float ne = texture2D(uMaskTexture, vUv + vec2(offset.x, offset.y)).r;
    float sw = texture2D(uMaskTexture, vUv + vec2(-offset.x, -offset.y)).r;
    float se = texture2D(uMaskTexture, vUv + vec2(offset.x, -offset.y)).r;

    // Gradient calculation with weighted cardinals (2x) for smoothness
    float gx = (ne + 2.0*e + se) - (nw + 2.0*w + sw);
    float gy = (nw + 2.0*n + ne) - (sw + 2.0*s + se);
    
    float edgeMag = length(vec2(gx, gy));
    
    // Smoothstep Range:
    // 0.0 start ensures we catch the very beginning of the slope (maximum thickness)
    // 2.5 end ensures the transition is very long and soft (maximum smoothness)
    float isEdge = smoothstep(0.0, 2.5, edgeMag);

    // --- Rounder Liquid Effect Generation ---
    float noiseScale = 4.0;
    float timeScale = 0.5;
    
    float noise = snoise(vUv * noiseScale + uTime * timeScale);
    // Add a second, slower noise layer for organic morphing
    float noise2 = snoise(vUv * (noiseScale * 0.7) - uTime * (timeScale * 0.8) + 10.0);
    
    float combinedNoise = (noise + noise2) * 0.5;
    
    // Distort background only at the edge
    vec2 distortion = vec2(combinedNoise * 0.02, combinedNoise * 0.02);
    vec4 distortedBg = texture2D(uBackgroundTexture, vUv + distortion);
    
    // --- Specular Highlight ---
    // Broader smoothstep range (0.3 to 0.9) creates softer, rounder highlights
    float highlight = smoothstep(0.3, 0.9, combinedNoise) * 0.6;
    
    // --- Color ---
    // Neutral/silver glass color
    vec4 liquidColorTint = vec4(0.9, 0.95, 1.0, 0.0);
    
    vec4 liquidColor = distortedBg + liquidColorTint * highlight;

    // --- Clean Background ---
    vec4 cleanBg = texture2D(uBackgroundTexture, vUv);
    
    // --- Real Person (Video) ---
    vec4 personColor = texture2D(uVideoTexture, vUv);
    
    // --- Composition ---
    vec4 outputColor = cleanBg;
    
    // Apply the liquid effect ONLY at the detected edges
    outputColor = mix(outputColor, liquidColor, isEdge);
    
    // --- Reveal Logic ---
    // We keep uRevealFactor here just in case, but primary reveal is particles.
    outputColor = mix(outputColor, personColor, uRevealFactor * maskVal);
    
    gl_FragColor = outputColor;
  }
`;

export class LiquidMaterialImpl extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uBackgroundTexture: { value: null },
        uVideoTexture: { value: null },
        uMaskTexture: { value: null },
        uRevealFactor: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    });
  }
}
