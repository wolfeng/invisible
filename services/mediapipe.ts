
// We rely on the global Pose class loaded via <script> tag in index.html
// to avoid ESM import issues with the CDN bundles.

export interface Results {
  poseLandmarks: any[];
  segmentationMask: ImageBitmap | HTMLCanvasElement;
  image: ImageBitmap | HTMLVideoElement;
}

declare global {
  class Pose {
    constructor(config: { locateFile: (file: string) => string });
    setOptions(options: any): void;
    onResults(callback: (results: Results) => void): void;
    send(input: { image: HTMLVideoElement | HTMLImageElement }): Promise<void>;
    close(): Promise<void>;
  }
}

// Manually define POSE_LANDMARKS
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32
};

export class MediaPipeService {
  private pose: Pose | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onResultsCallback: (results: Results) => void;
  private requestAnimationId: number | null = null;
  private isStopped = false; // Guard for React Strict Mode race conditions

  constructor(onResults: (results: Results) => void) {
    this.onResultsCallback = onResults;
  }

  public async initialize(videoElement: HTMLVideoElement) {
    this.isStopped = false;
    this.videoElement = videoElement;

    // Initialize the global Pose class
    this.pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: true,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.pose.onResults(this.onResultsCallback);

    // Custom camera loop
    try {
      // Use simpler constraints to reduce chance of errors, let browser pick default user facing
      const constraints = {
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // If stop() was called while we were waiting for permission/stream,
      // we must immediately stop the tracks and abort.
      if (this.isStopped) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.videoElement.srcObject = stream;
      
      await new Promise<void>((resolve) => {
        if (!this.videoElement) return resolve();
        this.videoElement.onloadedmetadata = () => {
          this.videoElement?.play();
          resolve();
        };
      });

      if (!this.isStopped) {
        this.processVideo();
      }
    } catch (error) {
      console.error("Error initializing camera:", error);
      throw error;
    }
  }

  private processVideo = async () => {
    if (this.isStopped || !this.videoElement || !this.pose) return;

    if (!this.videoElement.paused && !this.videoElement.ended) {
      // Send the frame to MediaPipe
      await this.pose.send({ image: this.videoElement });
    }
    
    // Schedule next frame
    this.requestAnimationId = requestAnimationFrame(this.processVideo);
  };

  public stop() {
    this.isStopped = true;

    if (this.requestAnimationId) {
      cancelAnimationFrame(this.requestAnimationId);
    }
    
    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }

    if (this.pose) {
      this.pose.close();
    }
  }
}

// Helper to detect if fingers are on head
export const checkFingerOnHead = (landmarks: any[]): boolean => {
  if (!landmarks || landmarks.length === 0) return false;

  // MediaPipe Pose Landmarks
  const nose = landmarks[POSE_LANDMARKS.NOSE];
  const leftIndex = landmarks[POSE_LANDMARKS.LEFT_INDEX];
  const rightIndex = landmarks[POSE_LANDMARKS.RIGHT_INDEX];
  
  if (!nose || !leftIndex || !rightIndex) return false;

  // Approximate forehead/head area radius relative to nose
  const getDistance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Thresholds adjusted for typical webcam FOV
  const HEAD_PROXIMITY_THRESHOLD = 0.2; 

  const leftHandOnHead = getDistance(leftIndex, nose) < HEAD_PROXIMITY_THRESHOLD && leftIndex.y < nose.y;
  const rightHandOnHead = getDistance(rightIndex, nose) < HEAD_PROXIMITY_THRESHOLD && rightIndex.y < nose.y;

  return leftHandOnHead || rightHandOnHead;
};

export const hasPeople = (landmarks: any[]): boolean => {
  return landmarks && landmarks.length > 0;
};
