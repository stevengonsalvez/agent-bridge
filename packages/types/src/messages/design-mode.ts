export type DesignModeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DesignModeViewport = {
  width: number;
  height: number;
  scroll_x: number;
  scroll_y: number;
};

export type DesignModeSelection = {
  selector: string;
  selectors: string[];
  xpath: string;
  tag_name: string;
  dom_snippet: string;
  text_content: string;
  text_editable: boolean;
  bounds: DesignModeRect;
  viewport: DesignModeViewport;
  computed_styles: Record<string, string>;
  color: string;
  screenshot_path?: string;
  react_components?: string[];
  react_prop_keys?: string[];
};

export type DesignModeEdit = {
  id: string;
  kind: 'style' | 'text';
  property: string;
  original_value: string;
  value: string;
};

export type DesignModePoint = {
  x: number;
  y: number;
};

export type DesignModeMark = {
  id: string;
  type: 'rect' | 'region' | 'arrow' | 'pen' | 'highlight' | 'text';
  color: string;
  strokeWidth?: number;
  opacity?: number;
  bounds?: DesignModeRect;
  points?: DesignModePoint[];
  text?: string;
  createdAt?: string;
};

export type DesignModeArtifacts = {
  screenshot_path?: string;
  page_screenshot_path?: string;
  element_screenshot_paths?: string[];
  live_context_path?: string;
  context_json_path?: string;
};

export type DesignModePromptToken = {
  selection?: number;
  text?: string;
};

export type DesignModeSnapshot = {
  revision: number;
  enabled: boolean;
  active_tool?: 'interact' | 'select' | 'pen' | 'rect' | 'arrow' | 'region';
  selection: DesignModeSelection | null;
  selections: DesignModeSelection[];
  marks: DesignModeMark[];
  edits: DesignModeEdit[];
  css_diff: string;
  prompt_text?: string;
  artifacts?: DesignModeArtifacts;
  agent_status?: {
    status: AgentStatus;
    message?: string;
    timestamp?: number;
  };
};

export type DesignModeHandoffPayload = {
  page_url: string;
  requested_change: string;
  css_diff: string;
  revision: number;
  edits: DesignModeEdit[];
  selections: DesignModeSelection[];
  marks?: DesignModeMark[];
  page_screenshot_path?: string;
  live_context_path?: string;
  context_json_path?: string;
  prompt: string | DesignModePromptToken[];
};

export type InteractiveElementRef = {
  ref: string;
  role: string;
  name?: string;
  tag: string;
  text: string;
  bounds: DesignModeRect;
  selector: string;
  xpath: string;
  disabled?: boolean;
  value?: string;
};

export type AgentStatus = 'idle' | 'working' | 'done' | 'error';

export type AgentStatusUpdateMessage = {
  type: 'agent_status_update';
  status: AgentStatus;
  message?: string;
  batchId?: string;
  timestamp?: number;
};

