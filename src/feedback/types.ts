export type ElementInfo = { testid: string | null; id: string | null; role: string | null; ariaLabel: string | null; text: string; tag: string; selector: string };
export type FeedbackPin = { n: number; x: number; y: number; element: ElementInfo | null };
export type FeedbackKind = 'bug' | 'enhancement' | 'question';
export type TrailEntry = { t: number; kind: 'nav' | 'click'; path: string; el: ElementInfo | null };
