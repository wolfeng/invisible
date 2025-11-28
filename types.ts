export enum AppState {
  INITIALIZING = 'INITIALIZING',
  WAITING_FOR_CLEAR_VIEW = 'WAITING_FOR_CLEAR_VIEW',
  CAPTURING_BACKGROUND = 'CAPTURING_BACKGROUND',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR'
}

export interface MediaPipeResults {
  image: ImageBitmap | HTMLVideoElement;
  segmentationMask?: ImageBitmap | HTMLCanvasElement;
  poseLandmarks?: any[]; // Using any to avoid complex MediaPipe typing without direct lib access
}

export interface GestureState {
  isTouchingHead: boolean;
}