import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { AppState, MediaPipeResults } from '../types';
import { LiquidMaterialImpl } from './LiquidShader';

// Register the custom shader material with R3F
extend({ LiquidMaterial: LiquidMaterialImpl });

interface SceneProps {
  appState: AppState;
  videoElement: HTMLVideoElement | null;
  backgroundDataUrl: string | null;
  latestResults: React.MutableRefObject<MediaPipeResults | null>;
  isTouchingHead: boolean;
}

const FullScreenQuad: React.FC<SceneProps> = ({ 
  appState, 
  videoElement, 
  backgroundDataUrl, 
  latestResults,
  isTouchingHead
}) => {
  const materialRef = useRef<LiquidMaterialImpl>(null);
  const { size, gl } = useThree();
  
  // Textures
  const [bgTexture, setBgTexture] = useState<THREE.Texture | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const maskTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  // Reveal Animation State
  const revealProgress = useRef(0);

  // Initialize Textures
  useEffect(() => {
    if (backgroundDataUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(backgroundDataUrl, (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        setBgTexture(tex);
      });
    }
  }, [backgroundDataUrl]);

  useEffect(() => {
    if (videoElement && !videoTextureRef.current) {
      const tex = new THREE.VideoTexture(videoElement);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      videoTextureRef.current = tex;
    }
  }, [videoElement]);

  useFrame((state, delta) => {
    if (!materialRef.current || !videoElement || !bgTexture) return;

    // 1. Update Video Texture
    if (videoTextureRef.current) {
      videoTextureRef.current.needsUpdate = true;
    }

    // 2. Update Mask Texture from MediaPipe Results
    const results = latestResults.current;
    if (results && results.segmentationMask) {
      const maskCanvas = maskCanvasRef.current;
      // Ensure canvas matches video size
      if (maskCanvas.width !== videoElement.videoWidth || maskCanvas.height !== videoElement.videoHeight) {
        maskCanvas.width = videoElement.videoWidth;
        maskCanvas.height = videoElement.videoHeight;
      }
      
      const ctx = maskCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        // Draw the segmentation mask
        // MP returns ImageBitmap or Canvas for segmentationMask
        ctx.drawImage(results.segmentationMask as CanvasImageSource, 0, 0, maskCanvas.width, maskCanvas.height);
        
        if (!maskTextureRef.current) {
          maskTextureRef.current = new THREE.CanvasTexture(maskCanvas);
        } else {
          maskTextureRef.current.needsUpdate = true;
        }
      }
    }

    // 3. Update Reveal Logic (Smooth transition)
    const targetReveal = isTouchingHead ? 1.0 : 0.0;
    revealProgress.current = THREE.MathUtils.lerp(revealProgress.current, targetReveal, delta * 3.0);

    // 4. Update Shader Uniforms
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uResolution.value.set(size.width, size.height);
    materialRef.current.uniforms.uBackgroundTexture.value = bgTexture;
    materialRef.current.uniforms.uVideoTexture.value = videoTextureRef.current;
    if (maskTextureRef.current) {
      materialRef.current.uniforms.uMaskTexture.value = maskTextureRef.current;
    }
    materialRef.current.uniforms.uRevealFactor.value = revealProgress.current;
  });

  if (!bgTexture) return null;

  return (
    <mesh scale={[-1, 1, 1]}>
      <planeGeometry args={[2, 2]} />
      {/* @ts-ignore */}
      <liquidMaterial ref={materialRef} />
    </mesh>
  );
};

export const InvisibleManExperience: React.FC<SceneProps> = (props) => {
  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [0, 0, 1], zoom: 1 }} // Orthographic-like setup in perspective or just use simple plane
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
      dpr={[1, 2]}
    >
      <FullScreenQuad {...props} />
    </Canvas>
  );
};