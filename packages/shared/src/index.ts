// @screentutor/shared — central type and schema barrel export
// User-facing product name: Quicky.AI (see brand.ts). Package scope stays @screentutor/*.

export * from './brand.js';
export * from './onboarding.js';
export * from './permission-policy.js';

// Schemas
export * from './schemas/drawing.js';
export * from './schemas/tutor.js';
export * from './schemas/memory.js';
export * from './sponsors.js';
export * from './point-parser.js';
export * from './overlay-refine.js';
export * from './figure-layout.js';
export * from './chess-board.js';
export * from './draw-shape-sanitize.js';
export * from './stream-tag-parser.js';
export * from './overlay-text.js';
export * from './narration-steps.js';
export * from './step-audio-queue.js';
export * from './explanation-format.js';

// Privacy
export * from './privacy.js';

// Demo math lessons
export * from './demo-lessons.js';

// Redaction & Observability Safety
export * from './redaction.js';

// Coordinate Mapping
export * from './coordinates.js';
export * from './capture-region.js';

// Tutor panel placement (buddy window geometry)
export * from './panel-placement.js';

// Tutor panel processing / explanation handoff presentation
export * from './tutor-panel-status.js';

// On-screen annotation pointer geometry / style
export * from './annotation-pointer.js';

// End-to-end tutoring pipeline contracts (pure)
export * from './tutoring-pipeline.js';

// macOS modifier flags (hold-to-talk)
export * from './keymap-darwin.js';
