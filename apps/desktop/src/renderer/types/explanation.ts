export interface StoredExplanation {
  text: string;
  anchorX: number;
  anchorY: number;
  dragOffsetX: number;
  dragOffsetY: number;
  visible: boolean;
}

export interface OverlayExplanationPayload {
  pointTarget: { x: number; y: number };
  text: string;
  dragOffsetX?: number;
  dragOffsetY?: number;
  showFullText?: boolean;
}
