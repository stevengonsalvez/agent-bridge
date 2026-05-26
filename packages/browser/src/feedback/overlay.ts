import type { AgentVisualSuggestion, AnnotationMark } from 'debug-bridge-types';
import type { FeedbackController } from './controller';

type Tool = 'select' | 'region' | 'rect' | 'highlight' | 'arrow' | 'pen' | 'text' | 'interact';

type ThreadEvent = {
  type: string;
  [key: string]: unknown;
};

export class FeedbackOverlay {
  private readonly controller: FeedbackController;
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private panelCollapsed = false;
  private activeTab: 'Batch' | 'Context' | 'Thread' = 'Batch';
  private activeTool: Tool = 'select';
  private busy = false;
  private startPoint: { x: number; y: number } | null = null;
  private points: Array<{ x: number; y: number }> = [];
  private undoStack: AnnotationMark[] = [];
  private readonly threadEvents: ThreadEvent[] = [];
  private rootEventsBound = false;
  private readonly handleRootClick = (event: Event) => this.handleAction(event);

  constructor(controller: FeedbackController) {
    this.controller = controller;
  }

  mount(): void {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.setAttribute('data-debug-bridge-feedback-overlay', 'true');
    this.host.style.position = 'fixed';
    this.host.style.inset = '0';
    this.host.style.zIndex = '2147483647';
    this.host.style.pointerEvents = 'none';
    this.root = this.host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(this.host);
    this.bindGlobalKeyboard();
    this.render();
  }

  unmount(): void {
    if (this.rootEventsBound) {
      this.root?.removeEventListener('click', this.handleRootClick);
      this.rootEventsBound = false;
    }
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.canvas = null;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  setCaptureHidden(hidden: boolean): void {
    if (this.host) this.host.style.visibility = hidden ? 'hidden' : 'visible';
  }

  addThreadEvent(event: ThreadEvent): void {
    this.threadEvents.push(event);
    this.showThread();
  }

  showThread(): void {
    this.activeTab = 'Thread';
    this.render();
  }

  render(): void {
    if (!this.root) return;
    const batch = this.controller.getBatch();
    const current = this.controller.getCurrentItem();
    this.root.innerHTML = `
      <style>${styles}</style>
      <canvas class="feedback-canvas" data-feedback-canvas></canvas>
      <div class="toolbar" data-feedback-toolbar>
        ${this.button('select', 'Select')}
        ${this.button('region', 'Region')}
        ${this.button('rect', 'Rect')}
        ${this.button('highlight', 'Highlight')}
        ${this.button('arrow', 'Arrow')}
        ${this.button('pen', 'Pen')}
        ${this.button('text', 'Text')}
        <button data-action="undo" title="Undo">Undo</button>
        <button data-action="redo" title="Redo">Redo</button>
        <button data-action="clear" title="Clear current item">Clear</button>
        ${this.button('interact', 'Interact')}
        <button data-action="submit" title="Submit feedback batch">${this.busy ? 'Submitting' : 'Submit'}</button>
      </div>
      <button class="pill" data-feedback-pill data-action="open-panel">Feedback batch active (${batch?.items.length ?? 0})</button>
      <aside class="panel ${this.panelCollapsed ? 'collapsed' : ''}" data-feedback-panel>
        <header>
          <strong>Feedback</strong>
          <button data-action="collapse" title="Collapse panel">${this.panelCollapsed ? 'Open' : 'Close'}</button>
        </header>
        <nav class="tabs">
          ${(['Batch', 'Context', 'Thread'] as const).map((tab) => `<button data-tab="${tab}" class="${this.activeTab === tab ? 'active' : ''}">${tab}</button>`).join('')}
        </nav>
        <section class="panel-body">${this.renderPanelBody(current)}</section>
      </aside>
    `;

    this.canvas = this.root.querySelector('[data-feedback-canvas]');
    this.resizeCanvas();
    if (this.canvas) this.canvas.style.pointerEvents = this.activeTool === 'interact' ? 'none' : 'auto';
    this.bindRootEvents();
    this.paintCanvas();
  }

  private renderPanelBody(current: ReturnType<FeedbackController['getCurrentItem']>): string {
    const batch = this.controller.getBatch();
    if (this.activeTab === 'Batch') {
      return `
        <div class="batch-list">
          ${(batch?.items ?? [])
            .map(
              (item) => `
              <button class="item ${item.id === current.id ? 'active' : ''}" data-item-id="${item.id}">
                <span>${item.id}</span>
                <small>${new URL(item.route.url).pathname || '/'}</small>
                <small>${item.marks.length} mark${item.marks.length === 1 ? '' : 's'}</small>
              </button>`
            )
            .join('')}
        </div>
        <label>Comment<textarea data-comment>${this.escape(current.comment)}</textarea></label>
      `;
    }
    if (this.activeTab === 'Context') {
      return `
        <dl>
          <dt>Route</dt><dd>${this.escape(window.location.pathname)}</dd>
          <dt>Viewport</dt><dd>${window.innerWidth}x${window.innerHeight}</dd>
          <dt>Component</dt><dd>${this.escape(current.sourceHints?.component ?? current.target?.sourceHints?.component ?? 'none')}</dd>
          <dt>Source</dt><dd>${this.escape(current.sourceHints?.sourceFile ?? current.target?.sourceHints?.sourceFile ?? 'none')}</dd>
          <dt>Target</dt><dd>${this.escape(current.target?.selector ?? 'none')}</dd>
        </dl>
      `;
    }
    const suggestions = (batch?.items ?? []).flatMap((item) =>
      item.suggestions.map((suggestion) => ({ ...suggestion, itemId: item.id }))
    );
    return `
      <div class="thread">
        ${this.threadEvents.map((event) => `<div class="thread-card">${this.escape(String(event.type))}</div>`).join('')}
        ${suggestions.map((suggestion) => this.renderSuggestion(suggestion)).join('')}
      </div>
    `;
  }

  private renderSuggestion(suggestion: AgentVisualSuggestion): string {
    return `
      <article class="thread-card" data-suggestion-card="${suggestion.id}">
        <strong>${this.escape(suggestion.comment ?? 'Visual suggestion')}</strong>
        <p>${this.escape(suggestion.patchHint ?? '')}</p>
        <small>${suggestion.status}</small>
        <div class="row">
          <button data-action="accept-suggestion" data-suggestion-id="${suggestion.id}">Accept</button>
          <button data-action="reject-suggestion" data-suggestion-id="${suggestion.id}">Reject</button>
          <button data-action="comment-suggestion" data-suggestion-id="${suggestion.id}">Comment</button>
        </div>
      </article>
    `;
  }

  private button(tool: Tool, label: string): string {
    return `<button data-tool="${tool}" class="${this.activeTool === tool ? 'active' : ''}" title="${label}">${label}</button>`;
  }

  private bindRootEvents(): void {
    if (!this.root || !this.canvas) return;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeTool = button.dataset.tool as Tool;
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeTab = button.dataset.tab as 'Batch' | 'Context' | 'Thread';
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-item-id]').forEach((button) => {
      button.addEventListener('click', () => this.controller.setCurrentItem(button.dataset.itemId!));
    });
    this.root.querySelector<HTMLTextAreaElement>('[data-comment]')?.addEventListener('input', (event) => {
      this.controller.updateCurrentComment((event.target as HTMLTextAreaElement).value);
    });
    if (!this.rootEventsBound) {
      this.root.addEventListener('click', this.handleRootClick);
      this.rootEventsBound = true;
    }
    this.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.handlePointerUp(event));
  }

  private bindGlobalKeyboard(): void {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.paintCanvas();
    });
  }

  private handleAction(event: Event): void {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    if (action === 'collapse') {
      this.panelCollapsed = !this.panelCollapsed;
      this.render();
    } else if (action === 'open-panel') {
      this.panelCollapsed = false;
      this.render();
    } else if (action === 'submit') {
      if (this.busy) return;
      void this.controller.submitBatch();
    } else if (action === 'clear') {
      this.controller.clearCurrentItem();
    } else if (action === 'undo') {
      const item = this.controller.getCurrentItem();
      const mark = item.marks.pop();
      if (mark) this.undoStack.push(mark);
      this.render();
    } else if (action === 'redo') {
      const mark = this.undoStack.pop();
      if (mark) this.controller.getCurrentItem().marks.push(mark);
      this.render();
    } else if (action === 'accept-suggestion') {
      this.controller.acceptSuggestion(target.dataset.suggestionId!);
    } else if (action === 'reject-suggestion') {
      this.controller.rejectSuggestion(target.dataset.suggestionId!);
    } else if (action === 'comment-suggestion') {
      const comment = window.prompt('Comment') ?? '';
      if (comment) this.controller.commentOnSuggestion(target.dataset.suggestionId!, comment);
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.activeTool === 'interact') return;
    event.preventDefault();
    this.startPoint = { x: event.clientX, y: event.clientY };
    this.points = [this.startPoint];
    this.canvas?.setPointerCapture(event.pointerId);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.startPoint || this.activeTool !== 'pen') return;
    this.points.push({ x: event.clientX, y: event.clientY });
    this.paintCanvas(this.previewMark());
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.startPoint || this.activeTool === 'interact') return;
    event.preventDefault();
    const end = { x: event.clientX, y: event.clientY };
    if (this.activeTool === 'select') {
      const element = this.elementAt(end.x, end.y);
      if (element) this.controller.addMark(this.rectMark(this.controller.captureElementTarget(element).bounds, 'highlight'), this.controller.captureElementTarget(element));
    } else if (this.activeTool === 'text') {
      const text = window.prompt('Label') ?? '';
      if (text) this.controller.addMark(this.textMark(end, text));
    } else {
      const mark = this.markFromDrag(end);
      if (mark) {
        if (this.activeTool === 'region') this.controller.getCurrentItem().region = mark.bounds;
        this.controller.addMark(mark);
      }
    }
    this.startPoint = null;
    this.points = [];
    this.paintCanvas();
  }

  private markFromDrag(end: { x: number; y: number }): AnnotationMark | null {
    if (!this.startPoint) return null;
    const bounds = this.bounds(this.startPoint, end);
    if (this.activeTool === 'rect' || this.activeTool === 'region') return this.rectMark(bounds, 'rect');
    if (this.activeTool === 'highlight') return this.rectMark(bounds, 'highlight');
    if (this.activeTool === 'arrow') return this.lineMark([this.startPoint, end], 'arrow');
    if (this.activeTool === 'pen') return this.lineMark([...this.points, end], 'pen');
    return null;
  }

  private previewMark(): AnnotationMark | null {
    if (!this.startPoint) return null;
    return this.lineMark(this.points, 'pen');
  }

  private rectMark(bounds: { x: number; y: number; width: number; height: number }, type: 'rect' | 'highlight'): AnnotationMark {
    return {
      id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      type,
      author: 'user',
      createdAt: new Date().toISOString(),
      color: type === 'highlight' ? '#facc15' : '#ef4444',
      strokeWidth: 3,
      opacity: type === 'highlight' ? 0.25 : 1,
      bounds,
    };
  }

  private lineMark(points: Array<{ x: number; y: number }>, type: 'arrow' | 'pen'): AnnotationMark {
    return {
      id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      type,
      author: 'user',
      createdAt: new Date().toISOString(),
      color: type === 'arrow' ? '#2563eb' : '#db2777',
      strokeWidth: 3,
      points,
    };
  }

  private textMark(point: { x: number; y: number }, text: string): AnnotationMark {
    return {
      id: `mark_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      type: 'text',
      author: 'user',
      createdAt: new Date().toISOString(),
      color: '#111827',
      strokeWidth: 1,
      points: [point],
      text,
    };
  }

  private paintCanvas(preview?: AnnotationMark | null): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const batch = this.controller.getBatch();
    const marks = [
      ...(batch?.items.flatMap((item) => item.marks) ?? []),
      ...(batch?.items.flatMap((item) => item.suggestions.flatMap((suggestion) => suggestion.marks)) ?? []),
      ...(preview ? [preview] : []),
    ];
    for (const mark of marks) this.drawMark(ctx, mark);
  }

  private drawMark(ctx: CanvasRenderingContext2D, mark: AnnotationMark): void {
    ctx.save();
    ctx.strokeStyle = mark.author === 'agent' ? '#16a34a' : mark.color;
    ctx.fillStyle = mark.author === 'agent' ? '#16a34a' : mark.color;
    ctx.lineWidth = mark.strokeWidth;
    ctx.globalAlpha = mark.opacity ?? 1;
    if ((mark.type === 'rect' || mark.type === 'highlight') && mark.bounds) {
      if (mark.type === 'highlight') ctx.fillRect(mark.bounds.x, mark.bounds.y, mark.bounds.width, mark.bounds.height);
      ctx.strokeRect(mark.bounds.x, mark.bounds.y, mark.bounds.width, mark.bounds.height);
    } else if ((mark.type === 'arrow' || mark.type === 'pen') && mark.points?.length) {
      ctx.beginPath();
      ctx.moveTo(mark.points[0].x, mark.points[0].y);
      for (const point of mark.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else if (mark.type === 'text' && mark.text && mark.points?.[0]) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(mark.text, mark.points[0].x, mark.points[0].y);
    }
    ctx.restore();
  }

  private elementAt(x: number, y: number): Element | null {
    const hostDisplay = this.host?.style.display;
    if (this.host) this.host.style.display = 'none';
    const element = document.elementFromPoint(x, y);
    if (this.host) this.host.style.display = hostDisplay ?? '';
    return element;
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private bounds(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }
}

const styles = `
  :host { all: initial; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #111827; }
  * { box-sizing: border-box; }
  .feedback-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: auto; }
  .toolbar { pointer-events: auto; position: fixed; top: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; padding: 6px; background: #111827; border: 1px solid #374151; border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,.24); }
  button { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 6px; padding: 6px 9px; font: 12px system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  button.active, .toolbar button.active { background: #2563eb; border-color: #2563eb; color: #fff; }
  .toolbar button { background: #1f2937; color: #f9fafb; border-color: #4b5563; }
  .pill { pointer-events: auto; position: fixed; right: 18px; bottom: 18px; background: #111827; color: #fff; border-color: #111827; }
  .panel { pointer-events: auto; position: fixed; top: 64px; right: 14px; width: 340px; max-height: calc(100vh - 88px); display: flex; flex-direction: column; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 18px 44px rgba(0,0,0,.2); overflow: hidden; }
  .panel.collapsed { display: none; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
  .tabs { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #e5e7eb; }
  .tabs button { border: 0; border-radius: 0; border-right: 1px solid #e5e7eb; }
  .panel-body { padding: 12px; overflow: auto; }
  .batch-list { display: grid; gap: 6px; margin-bottom: 10px; }
  .item { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; text-align: left; align-items: center; }
  .item.active { outline: 2px solid #2563eb; }
  small { color: #6b7280; }
  label { display: grid; gap: 6px; font: 12px system-ui, sans-serif; }
  textarea { width: 100%; min-height: 90px; resize: vertical; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; font: 13px system-ui, sans-serif; }
  dl { display: grid; grid-template-columns: 88px 1fr; gap: 8px; margin: 0; font: 12px system-ui, sans-serif; }
  dt { color: #6b7280; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .thread { display: grid; gap: 8px; }
  .thread-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #f9fafb; }
  .thread-card p { margin: 6px 0; font-size: 12px; }
  .row { display: flex; gap: 6px; margin-top: 8px; }
`;
