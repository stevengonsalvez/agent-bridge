import type { BaseMessage } from './base';

export type FeedbackStatus = 'draft' | 'submitted' | 'in_progress' | 'needs_review' | 'resolved';
export type FeedbackItemStatus = 'open' | 'in_progress' | 'fixed' | 'needs_review' | 'resolved';
export type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'commented';
export type AnnotationAuthor = 'user' | 'agent';
export type AnnotationMarkType = 'rect' | 'highlight' | 'arrow' | 'pen' | 'text';

export type FeedbackRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FeedbackPoint = {
  x: number;
  y: number;
};

export type AnnotationMark = {
  id: string;
  type: AnnotationMarkType;
  author: AnnotationAuthor;
  createdAt: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
  bounds?: FeedbackRect;
  points?: FeedbackPoint[];
  text?: string;
};

export type FeedbackAsset = {
  kind: 'screenshot' | 'annotated';
  mimeType: 'image/webp' | 'image/png';
  data?: string;
  path?: string;
  width: number;
  height: number;
  byteLength: number;
  captureDownscaled?: boolean;
};

export type SourceHints = {
  testId?: string;
  component?: string;
  sourceFile?: string;
  sourceLine?: string;
  owner?: string;
  feature?: string;
};

export type ElementFeedbackTarget = {
  stableId?: string;
  selector?: string;
  role?: string;
  text?: string;
  label?: string;
  bounds: FeedbackRect;
  meta: Record<string, unknown>;
  sourceHints?: SourceHints;
};

export type FeedbackRouteContext = {
  url: string;
  pathname: string;
  title?: string;
};

export type FeedbackViewportContext = {
  width: number;
  height: number;
  devicePixelRatio: number;
};

export type FeedbackTelemetry = {
  console: Array<{ level: string; args: string[]; timestamp: number }>;
  errors: Array<{ message: string; stack?: string; timestamp: number }>;
  network: Array<{
    type: 'request' | 'response';
    requestId: string;
    method?: string;
    url?: string;
    status?: number;
    statusText?: string;
    ok?: boolean;
    duration?: number;
    timestamp: number;
  }>;
  navigation: Array<{ url: string; previousUrl?: string; trigger: string; timestamp: number }>;
};

export type GitContext = {
  repoRoot?: string;
  branch?: string;
  headSha?: string;
  dirty: boolean;
  changedFiles: string[];
};

export type AgentVisualSuggestion = {
  id: string;
  itemId: string;
  batchId?: string;
  createdAt: string;
  status: SuggestionStatus;
  comment?: string;
  patchHint?: string;
  marks: AnnotationMark[];
  discussion?: Array<{ author: 'user' | 'agent'; comment: string; createdAt: string }>;
};

export type UiFeedbackItem = {
  id: string;
  batchId: string;
  createdAt: string;
  updatedAt: string;
  status: FeedbackItemStatus;
  route: FeedbackRouteContext;
  viewport: FeedbackViewportContext;
  target?: ElementFeedbackTarget;
  region?: FeedbackRect;
  comment: string;
  marks: AnnotationMark[];
  screenshot: FeedbackAsset;
  annotated: FeedbackAsset;
  appState?: Record<string, unknown>;
  telemetry?: FeedbackTelemetry;
  sourceHints?: SourceHints;
  suggestions: AgentVisualSuggestion[];
};

export type UiFeedbackBatch = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: FeedbackStatus;
  appName?: string;
  sessionId: string;
  itemIds: string[];
  routes: string[];
  artifactRoot?: string;
  git?: GitContext;
  items: UiFeedbackItem[];
};

export type FeedbackArtifactRef = {
  batchId: string;
  itemCount: number;
  artifactRoot: string;
  summaryPath: string;
  batchPath: string;
};

export type UiFeedbackEnableMessage = BaseMessage & {
  type: 'ui_feedback_enable';
  requestId?: string;
};

export type UiFeedbackDisableMessage = BaseMessage & {
  type: 'ui_feedback_disable';
  requestId?: string;
};

export type UiFeedbackBatchSubmitMessage = BaseMessage & {
  type: 'ui_feedback_batch_submit';
  batch: UiFeedbackBatch;
};

export type UiFeedbackBatchCreatedMessage = BaseMessage &
  FeedbackArtifactRef & {
    type: 'ui_feedback_batch_created';
  };

export type UiFeedbackBatchUpdatedMessage = BaseMessage &
  FeedbackArtifactRef & {
    type: 'ui_feedback_batch_updated';
  };

export type UiFeedbackItemUpdatedMessage = BaseMessage & {
  type: 'ui_feedback_item_updated';
  batchId: string;
  itemId: string;
  itemPath?: string;
  status?: FeedbackItemStatus;
};

export type UiFeedbackStatusUpdateMessage = BaseMessage & {
  type: 'ui_feedback_status_update';
  batchId: string;
  itemId?: string;
  status: FeedbackStatus | FeedbackItemStatus;
  comment?: string;
};

export type UiFeedbackCommentAddedMessage = BaseMessage & {
  type: 'ui_feedback_comment_added';
  batchId: string;
  itemId?: string;
  suggestionId?: string;
  author: 'user' | 'agent';
  comment: string;
};

export type UiFeedbackSuggestionAddedMessage = BaseMessage & {
  type: 'ui_feedback_suggestion_added';
  batchId: string;
  itemId: string;
  suggestion: AgentVisualSuggestion;
};

export type UiFeedbackSuggestionAcceptedMessage = BaseMessage & {
  type: 'ui_feedback_suggestion_accepted';
  batchId: string;
  itemId: string;
  suggestionId: string;
  comment?: string;
};

export type UiFeedbackSuggestionRejectedMessage = BaseMessage & {
  type: 'ui_feedback_suggestion_rejected';
  batchId: string;
  itemId: string;
  suggestionId: string;
  comment?: string;
};

export type UiFeedbackSuggestionCommentedMessage = BaseMessage & {
  type: 'ui_feedback_suggestion_commented';
  batchId: string;
  itemId: string;
  suggestionId: string;
  comment: string;
};

export type UiFeedbackSuggestionDecisionMessage = BaseMessage & {
  type: 'ui_feedback_suggestion_decision';
  batchId: string;
  itemId: string;
  suggestionId: string;
  status: SuggestionStatus;
  comment?: string;
  batchPath?: string;
  itemPath?: string;
};

export type UiFeedbackMessage =
  | UiFeedbackEnableMessage
  | UiFeedbackDisableMessage
  | UiFeedbackBatchSubmitMessage
  | UiFeedbackBatchCreatedMessage
  | UiFeedbackBatchUpdatedMessage
  | UiFeedbackItemUpdatedMessage
  | UiFeedbackStatusUpdateMessage
  | UiFeedbackCommentAddedMessage
  | UiFeedbackSuggestionAddedMessage
  | UiFeedbackSuggestionAcceptedMessage
  | UiFeedbackSuggestionRejectedMessage
  | UiFeedbackSuggestionCommentedMessage
  | UiFeedbackSuggestionDecisionMessage;
