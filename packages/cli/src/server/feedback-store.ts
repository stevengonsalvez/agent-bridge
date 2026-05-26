import fs from 'node:fs';
import path from 'node:path';
import type {
  FeedbackArtifactRef,
  FeedbackAsset,
  UiFeedbackBatch,
  UiFeedbackBatchCreatedMessage,
  UiFeedbackSuggestionAcceptedMessage,
  UiFeedbackSuggestionAddedMessage,
  UiFeedbackSuggestionCommentedMessage,
  UiFeedbackSuggestionDecisionMessage,
  UiFeedbackSuggestionRejectedMessage,
} from 'debug-bridge-types';
import { PROTOCOL_VERSION } from 'debug-bridge-types';
import { collectGitContext } from './git-context';

type PersistedBatch = UiFeedbackBatch & {
  artifactRoot: string;
};

type StoreOptions = {
  rootDir?: string;
  writeArtifacts?: boolean;
};

const DEFAULT_ROOT = '.debug-bridge/feedback';

export class FeedbackStore {
  private readonly rootDir: string;
  private readonly writeArtifacts: boolean;
  private latestBatchId: string | null = null;

  constructor(options: StoreOptions = {}) {
    this.rootDir = path.resolve(process.cwd(), options.rootDir ?? DEFAULT_ROOT);
    this.writeArtifacts = options.writeArtifacts ?? true;
  }

  persistBatch(message: { sessionId: string; batch: UiFeedbackBatch }): UiFeedbackBatchCreatedMessage {
    const batch = this.normalizeBatch(message.batch, message.sessionId);
    const ref = this.createArtifactRef(batch.id, batch.items.length);

    if (this.writeArtifacts) {
      fs.mkdirSync(ref.absoluteRoot, { recursive: true });
      const items = batch.items.map((item) => {
        const itemDir = path.join(ref.absoluteRoot, 'items', item.id);
        fs.mkdirSync(itemDir, { recursive: true });
        const persisted = {
          ...item,
          screenshot: this.writeAsset(itemDir, 'screenshot', item.screenshot),
          annotated: this.writeAsset(itemDir, 'annotated', item.annotated),
        };
        fs.writeFileSync(path.join(itemDir, 'item.json'), JSON.stringify(persisted, null, 2));
        return persisted;
      });

      const persistedBatch: PersistedBatch = {
        ...batch,
        itemIds: items.map((item) => item.id),
        routes: [...new Set(items.map((item) => item.route.url))],
        artifactRoot: ref.artifactRoot,
        git: collectGitContext(),
        items,
      };
      fs.writeFileSync(path.join(ref.absoluteRoot, 'batch.json'), JSON.stringify(persistedBatch, null, 2));
      fs.writeFileSync(path.join(ref.absoluteRoot, 'summary.md'), this.renderSummary(persistedBatch));
    }

    this.latestBatchId = batch.id;
    return {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: message.sessionId,
      timestamp: Date.now(),
      type: 'ui_feedback_batch_created',
      batchId: batch.id,
      itemCount: batch.items.length,
      artifactRoot: ref.artifactRoot,
      summaryPath: ref.summaryPath,
      batchPath: ref.batchPath,
    };
  }

  persistSuggestion(message: UiFeedbackSuggestionAddedMessage): void {
    const batch = this.readBatch(this.resolveBatchId(message.batchId));
    if (!batch) return;
    const item = batch.items.find((candidate) => candidate.id === message.itemId);
    if (!item) return;

    const suggestion = {
      ...message.suggestion,
      batchId: batch.id,
      itemId: item.id,
      createdAt: message.suggestion.createdAt || new Date().toISOString(),
      status: message.suggestion.status || 'proposed',
    };
    const index = item.suggestions.findIndex((candidate) => candidate.id === suggestion.id);
    if (index >= 0) item.suggestions[index] = suggestion;
    else item.suggestions.push(suggestion);
    batch.updatedAt = new Date().toISOString();
    this.writeBatchState(batch);
  }

  persistDecision(
    message:
      | UiFeedbackSuggestionAcceptedMessage
      | UiFeedbackSuggestionRejectedMessage
      | UiFeedbackSuggestionCommentedMessage
  ): UiFeedbackSuggestionDecisionMessage {
    const batchId = this.resolveBatchId(message.batchId);
    const status =
      message.type === 'ui_feedback_suggestion_accepted'
        ? 'accepted'
        : message.type === 'ui_feedback_suggestion_rejected'
          ? 'rejected'
          : 'commented';

    const batch = this.readBatch(batchId);
    if (batch) {
      const item = batch.items.find((candidate) => candidate.id === message.itemId);
      const suggestion = item?.suggestions.find((candidate) => candidate.id === message.suggestionId);
      if (suggestion) {
        suggestion.status = status;
        if (message.comment) {
          suggestion.comment = message.comment;
          suggestion.discussion = [
            ...(suggestion.discussion ?? []),
            { author: 'user', comment: message.comment, createdAt: new Date().toISOString() },
          ];
        }
      }
      batch.updatedAt = new Date().toISOString();
      this.writeBatchState(batch);
    }

    return {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: message.sessionId,
      timestamp: Date.now(),
      type: 'ui_feedback_suggestion_decision',
      batchId,
      itemId: message.itemId,
      suggestionId: message.suggestionId,
      status,
      comment: message.comment,
      batchPath: this.relative(path.join(this.rootDir, batchId, 'batch.json')),
      itemPath: this.relative(path.join(this.rootDir, batchId, 'items', message.itemId, 'item.json')),
    };
  }

  private normalizeBatch(batch: UiFeedbackBatch, sessionId: string): UiFeedbackBatch {
    const now = new Date().toISOString();
    const id = batch.id || this.createBatchId();
    const items = batch.items.map((item, index) => ({
      ...item,
      id: item.id || `item_${index + 1}_${Math.random().toString(16).slice(2, 8)}`,
      batchId: id,
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      status: item.status || 'open',
      suggestions: item.suggestions ?? [],
    }));

    return {
      ...batch,
      id,
      createdAt: batch.createdAt || now,
      updatedAt: now,
      status: 'submitted',
      sessionId: batch.sessionId || sessionId,
      itemIds: items.map((item) => item.id),
      routes: [...new Set(items.map((item) => item.route.url))],
      items,
    };
  }

  private createArtifactRef(batchId: string, itemCount: number): FeedbackArtifactRef & { absoluteRoot: string } {
    const absoluteRoot = path.join(this.rootDir, batchId);
    return {
      batchId,
      itemCount,
      absoluteRoot,
      artifactRoot: this.relative(absoluteRoot),
      summaryPath: this.relative(path.join(absoluteRoot, 'summary.md')),
      batchPath: this.relative(path.join(absoluteRoot, 'batch.json')),
    };
  }

  private writeAsset(itemDir: string, name: 'screenshot' | 'annotated', asset: FeedbackAsset): FeedbackAsset {
    const extension = asset.mimeType === 'image/webp' ? 'webp' : 'png';
    const filePath = path.join(itemDir, `${name}.${extension}`);
    if (asset.data) {
      const payload = asset.data.includes(',') ? asset.data.split(',')[1] : asset.data;
      fs.writeFileSync(filePath, payload, 'base64');
    }
    return {
      ...asset,
      data: undefined,
      path: this.relative(filePath),
      byteLength: fs.existsSync(filePath) ? fs.statSync(filePath).size : asset.byteLength,
    };
  }

  private readBatch(batchId: string): PersistedBatch | null {
    const batchPath = path.join(this.rootDir, batchId, 'batch.json');
    if (!fs.existsSync(batchPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(batchPath, 'utf8')) as PersistedBatch;
    } catch {
      return null;
    }
  }

  private writeBatchState(batch: PersistedBatch): void {
    const root = path.join(this.rootDir, batch.id);
    fs.writeFileSync(path.join(root, 'batch.json'), JSON.stringify(batch, null, 2));
    fs.writeFileSync(path.join(root, 'summary.md'), this.renderSummary(batch));
    for (const item of batch.items) {
      const itemDir = path.join(root, 'items', item.id);
      fs.mkdirSync(itemDir, { recursive: true });
      fs.writeFileSync(path.join(itemDir, 'item.json'), JSON.stringify(item, null, 2));
    }
  }

  private renderSummary(batch: PersistedBatch): string {
    const lines = [
      `# UI Feedback Batch ${batch.id}`,
      '',
      `Status: ${batch.status}`,
      `Session: ${batch.sessionId}`,
      `Items: ${batch.items.length}`,
      `Routes: ${batch.routes.join(', ')}`,
      '',
      '## Git',
      '',
      `- Repo: ${batch.git?.repoRoot ?? 'unknown'}`,
      `- Branch: ${batch.git?.branch ?? 'unknown'}`,
      `- HEAD: ${batch.git?.headSha ?? 'unknown'}`,
      `- Dirty: ${batch.git?.dirty ? 'yes' : 'no'}`,
      '',
      '## Items',
      '',
    ];

    for (const item of batch.items) {
      lines.push(`### ${item.id}`, '');
      lines.push(`- Route: ${item.route.url}`);
      lines.push(`- Comment: ${item.comment || '(none)'}`);
      lines.push(`- Marks: ${item.marks.map((mark) => mark.type).join(', ') || '(none)'}`);
      lines.push(`- Source: ${item.sourceHints?.component ?? item.target?.sourceHints?.component ?? '(unknown)'}`);
      lines.push(`- Suggestions: ${item.suggestions.length}`, '');
    }

    return `${lines.join('\n')}\n`;
  }

  private resolveBatchId(batchId: string): string {
    return batchId === 'latest' && this.latestBatchId ? this.latestBatchId : batchId;
  }

  private createBatchId(): string {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return `fb_${stamp}_${Math.random().toString(16).slice(2, 8)}`;
  }

  private relative(filePath: string): string {
    return path.relative(process.cwd(), filePath) || '.';
  }
}
