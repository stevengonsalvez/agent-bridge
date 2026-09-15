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
};

export type DesignModeEdit = {
  id: string;
  kind: 'style' | 'text';
  property: string;
  original_value: string;
  value: string;
};

export type DesignModeSnapshot = {
  revision: number;
  enabled: boolean;
  selection: DesignModeSelection | null;
  selections: DesignModeSelection[];
  edits: DesignModeEdit[];
  css_diff: string;
};

export type DesignModeHandoffPayload = {
  page_url: string;
  requested_change: string;
  css_diff: string;
  revision: number;
  edits: DesignModeEdit[];
  selections: DesignModeSelection[];
  page_screenshot_path?: string;
  prompt: string;
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
