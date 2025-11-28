
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MediaPipeService, checkFingerOnHead, hasPeople, Results } from './services/mediapipe';
import { InvisibleManExperience } from './components/InvisibleManExperience';
import { AppState, MediaPipeResults } from './types';

// State display labels in Chinese
const STATE_LABELS: Record<string, string> = {
  [AppState.INITIALIZING]: '初始化中',
  [AppState.WAITING_FOR_CLEAR_VIEW]: '等待背景清空',
  [AppState.CAPTURING_BACKGROUND]: '正在捕获背景',
  [AppState.ACTIVE]: '隐身模式运行中',
  [AppState.ERROR]: '错误'
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.INITIALIZING);
  const [statusMessage, setStatusMessage] = useState<string>("正在初始化摄像头...");
  const [backgroundDataUrl, setBackgroundDataUrl] = useState<string | null>(null);
  const [isTouchingHead, setIsTouchingHead] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const latestResultsRef = useRef<MediaPipeResults | null>(null);
  const mpServiceRef = useRef<MediaPipeService | null>(null);
  const noPersonTimerRef = useRef<number>(0);

  // Handle MediaPipe Results
  const onResults = useCallback((results: Results) => {
    latestResultsRef.current = {
      image: results.image,
      segmentationMask: results.segmentationMask,
      poseLandmarks: results.poseLandmarks,
    };

    // Logic Dispatcher based on State
    handleGameLogic(results);
  }, [appState]); // Depend on appState to switch logic if needed, but better to check state inside ref or switcher

  const handleGameLogic = (results: Results) => {
    // We need to access current state inside the callback loop
    // Since onResults is a closure, we might need a Ref for current state if we don't want to re-init MP
    // However, for simplicity, let's rely on the setAppState functional updates or refs for data collection
  };

  // Because the callback is bound once, we use a ref to track state for logic inside onResults
  const stateRef = useRef<AppState>(AppState.INITIALIZING);
  useEffect(() => { stateRef.current = appState; }, [appState]);

  // Main Loop Logic injected into MP callback (simulated via effect or modifying callback)
  // Actually, let's do the logic processing in the callback:
  const wrappedOnResults = (results: Results) => {
    onResults(results);
    
    const currentState = stateRef.current;
    const landmarks = results.poseLandmarks;
    const isPersonPresent = hasPeople(landmarks);

    if (currentState === AppState.WAITING_FOR_CLEAR_VIEW) {
      if (!isPersonPresent) {
        // Person is gone, increment timer or frame count
        noPersonTimerRef.current += 1;
        if (noPersonTimerRef.current > 30) { // Approx 1 second of clear view
          setAppState(AppState.CAPTURING_BACKGROUND);
        } else {
           // Providing feedback could be done here
        }
      } else {
        noPersonTimerRef.current = 0; // Reset if person appears
      }
    } else if (currentState === AppState.ACTIVE) {
      // Check gestures
      if (landmarks) {
        const touching = checkFingerOnHead(landmarks);
        setIsTouchingHead(touching);
      } else {
        setIsTouchingHead(false);
      }
    }
  };

  // Initialize System
  useEffect(() => {
    // Clean up previous instance if any
    if (mpServiceRef.current) {
      mpServiceRef.current.stop();
    }

    if (videoRef.current) {
      // Reset state for retry
      setAppState(AppState.INITIALIZING);
      setStatusMessage("正在初始化摄像头...");
      
      const service = new MediaPipeService(wrappedOnResults);
      mpServiceRef.current = service;
      
      service.initialize(videoRef.current).then(() => {
        setAppState(AppState.WAITING_FOR_CLEAR_VIEW);
        setStatusMessage("请完全离开画面以捕获背景。");
      }).catch(err => {
        console.error(err);
        setAppState(AppState.ERROR);
        setStatusMessage("摄像头初始化失败: 请允许摄像头权限。");
      });
    }

    return () => {
      mpServiceRef.current?.stop();
    };
  }, [retryCount]); // Re-run when retryCount changes

  // Capture Background Effect
  useEffect(() => {
    if (appState === AppState.CAPTURING_BACKGROUND && videoRef.current) {
      // Create a temporary canvas to capture the frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        setBackgroundDataUrl(dataUrl);
        setAppState(AppState.ACTIVE);
        setStatusMessage("");
      }
    }
  }, [appState]);

  // Status Message Updates based on logic
  useEffect(() => {
    if (appState === AppState.WAITING_FOR_CLEAR_VIEW) {
        // Managed in state transition
    }
  }, [appState]);


  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center">
      {/* Hidden Video Feed for MediaPipe */}
      <video
        ref={videoRef}
        className="absolute opacity-0 pointer-events-none"
        playsInline
        style={{ transform: 'scaleX(-1)' }} 
      />

      {/* Main AR Canvas */}
      {appState === AppState.ACTIVE && backgroundDataUrl && (
        <div className="absolute inset-0 z-10">
          <InvisibleManExperience
            appState={appState}
            videoElement={videoRef.current}
            backgroundDataUrl={backgroundDataUrl}
            latestResults={latestResultsRef}
            isTouchingHead={isTouchingHead}
          />
        </div>
      )}

      {/* UI Overlay */}
      <div className="absolute z-20 top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-8">
        
        {/* Header */}
        <div className="w-full flex justify-between items-start">
          <div className="bg-black/50 backdrop-blur-md p-4 rounded-xl border border-white/10">
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-200">
              隐形人
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${appState === AppState.ACTIVE ? 'bg-green-500 animate-pulse' : appState === AppState.ERROR ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
              <span className="text-xs text-gray-400 font-mono">{STATE_LABELS[appState] || appState}</span>
            </div>
          </div>
        </div>

        {/* Center Instructions */}
        {appState !== AppState.ACTIVE && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-auto">
            <div className="bg-black/70 backdrop-blur-lg p-8 rounded-2xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,255,255,0.1)]">
              <div className="text-cyan-400 mb-4 text-4xl animate-bounce">
                 {appState === AppState.WAITING_FOR_CLEAR_VIEW ? '🏃‍♂️' : appState === AppState.ERROR ? '⚠️' : '📷'}
              </div>
              <h2 className="text-xl font-bold text-white mb-2 font-mono">
                {appState === AppState.INITIALIZING && "正在初始化核心系统..."}
                {appState === AppState.WAITING_FOR_CLEAR_VIEW && "请离开画面"}
                {appState === AppState.CAPTURING_BACKGROUND && "正在捕获背景..."}
                {appState === AppState.ERROR && "摄像头连接失败"}
              </h2>
              <p className="text-gray-300 max-w-xs text-sm mb-4">
                {appState === AppState.WAITING_FOR_CLEAR_VIEW && "我们需要一张干净的背景照片来制作隐身效果。"}
                {appState === AppState.ERROR && "请确保您已允许浏览器访问摄像头。"}
              </p>
              
              {appState === AppState.ERROR && (
                <button 
                  onClick={() => setRetryCount(c => c + 1)}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-bold transition-all"
                >
                  重试
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer debug/info */}
        <div className="w-full text-center opacity-30 text-xs text-white font-mono">
           技术支持：TensorFlow MediaPipe & Three.js
        </div>
      </div>
    </div>
  );
};

export default App;
