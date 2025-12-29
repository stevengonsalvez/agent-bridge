export type Capability =
  | 'dom_snapshot'
  | 'dom_mutations'
  | 'ui_tree'
  | 'console'
  | 'errors'
  | 'eval'
  | 'custom_state';

export type ElementTarget = {
  stableId?: string;
  selector?: string;
  text?: string;
  role?: string;
};

export type UiTreeItem = {
  stableId: string;
  selector: string;
  role: string;
  text?: string;
  label?: string;
  disabled: boolean;
  visible: boolean;
  checked?: boolean;
  value?: string;
  meta: {
    tagName: string;
    type?: string;
    name?: string;
    href?: string;
    placeholder?: string;
    [key: string]: unknown;
  };
};

export type DomMutation = {
  mutationType: 'childList' | 'attributes' | 'characterData';
  targetSelector: string;
  attributeName?: string;
  addedNodes?: { type: string; tagName?: string; html?: string }[];
  removedNodes?: { type: string; tagName?: string }[];
};
