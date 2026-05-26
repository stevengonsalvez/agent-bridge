import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { AnnotationMark, UiFeedbackBatch } from 'debug-bridge-types';
import { BridgeFeedbackClient } from './bridge-client';
import { FeedbackArtifacts } from './artifacts';

export type FeedbackMcpOptions = {
  bridgePort: number;
  bridgeHost: string;
  sessionId: string;
  feedbackDir: string;
  wsUrl?: string;
};

type JsonRecord = Record<string, unknown>;

const markSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(['rect', 'highlight', 'arrow', 'pen', 'text']),
    author: z.literal('agent').optional(),
    createdAt: z.string().optional(),
    color: z.string().optional(),
    strokeWidth: z.number().optional(),
    opacity: z.number().optional(),
    bounds: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .optional(),
    points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    text: z.string().optional(),
  })
  .passthrough();

export function createFeedbackMcpServer(options: FeedbackMcpOptions): {
  server: McpServer;
  client: BridgeFeedbackClient;
  artifacts: FeedbackArtifacts;
} {
  const wsUrl =
    options.wsUrl ??
    `ws://${options.bridgeHost}:${options.bridgePort}/debug?role=agent&sessionId=${encodeURIComponent(options.sessionId)}`;
  const artifacts = new FeedbackArtifacts(options.feedbackDir);
  const client = new BridgeFeedbackClient({ wsUrl, sessionId: options.sessionId, reconnect: true });
  client.connect();

  const server = new McpServer(
    { name: 'debug-bridge-feedback', version: '0.1.0' },
    {
      instructions:
        'Use this server to watch Agent Bridge UI feedback. Call wait_for_feedback_batch after starting feedback mode, read the returned batch artifact, inspect screenshot and source hints, then call send_visual_suggestion to render proposed fixes back in the live app. Apply code changes only after the user accepts or explicitly asks you to proceed.',
    },
  );

  server.registerResource(
    'feedback-latest',
    'feedback://latest',
    {
      title: 'Latest UI Feedback Batch',
      description: 'Latest persisted Agent Bridge UI feedback batch as JSON.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const batch = artifacts.latestBatch();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(batch ?? { error: 'No feedback batches found' }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'feedback-batch',
    new ResourceTemplate('feedback://batch/{batchId}', {
      list: async () => ({
        resources: artifacts.listBatches(50).map((batch) => ({
          uri: `feedback://batch/${batch.id}`,
          name: batch.id,
          title: `UI feedback batch ${batch.id}`,
          description: `${batch.itemCount} item(s), ${batch.routes.join(', ')}`,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'UI Feedback Batch',
      description: 'Persisted Agent Bridge UI feedback batch by id.',
      mimeType: 'application/json',
    },
    async (uri, { batchId }) => {
      const id = Array.isArray(batchId) ? batchId[0] : batchId;
      const batch = artifacts.readBatch(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(batch ?? { error: `Feedback batch not found: ${id}` }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'feedback-summary',
    new ResourceTemplate('feedback://summary/{batchId}', {
      list: async () => ({
        resources: artifacts.listBatches(50).map((batch) => ({
          uri: `feedback://summary/${batch.id}`,
          name: `${batch.id} summary`,
          title: `Summary for ${batch.id}`,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'UI Feedback Summary',
      description: 'Markdown summary of a persisted UI feedback batch.',
      mimeType: 'text/markdown',
    },
    async (uri, { batchId }) => {
      const id = Array.isArray(batchId) ? batchId[0] : batchId;
      const summary = artifacts.readSummary(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: summary ?? `Feedback summary not found: ${id}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'feedback_status',
    {
      title: 'Feedback Watcher Status',
      description: 'Report bridge connection status and latest feedback event tracked by the MCP watcher.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => jsonResult(client.status()),
  );

  server.registerTool(
    'list_feedback_batches',
    {
      title: 'List Feedback Batches',
      description: 'List persisted UI feedback batches with resource URIs and artifact paths.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(100).optional().default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const batches = artifacts.listBatches(limit);
      return jsonResult({
        rootDir: artifacts.rootDir,
        batches,
        resources: batches.map((batch) => ({
          batch: `feedback://batch/${batch.id}`,
          summary: `feedback://summary/${batch.id}`,
        })),
      });
    },
  );

  server.registerTool(
    'read_feedback_batch',
    {
      title: 'Read Feedback Batch',
      description: 'Read a persisted feedback batch and summary. Use batchId "latest" for the newest batch.',
      inputSchema: z.object({
        batchId: z.string().optional().default('latest'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ batchId }) => {
      const batch = artifacts.readBatch(batchId);
      if (!batch) return errorResult(`Feedback batch not found: ${batchId}`);
      return jsonResult({
        batch,
        summary: artifacts.readSummary(batch.id),
        resources: {
          batch: `feedback://batch/${batch.id}`,
          summary: `feedback://summary/${batch.id}`,
        },
      });
    },
  );

  server.registerTool(
    'wait_for_feedback_batch',
    {
      title: 'Wait For Feedback Batch',
      description: 'Wait for the next submitted UI feedback batch event from the live bridge.',
      inputSchema: z.object({
        timeoutMs: z.number().int().positive().max(300000).optional().default(60000),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ timeoutMs }) => {
      try {
        const event = await client.waitForBatch(timeoutMs);
        const batch = artifacts.readBatch(event.batchId);
        return jsonResult({
          event,
          batch,
          resources: {
            batch: `feedback://batch/${event.batchId}`,
            summary: `feedback://summary/${event.batchId}`,
          },
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'wait_for_feedback_decision',
    {
      title: 'Wait For Feedback Decision',
      description: 'Wait for the user to accept, reject, or comment on an agent visual suggestion.',
      inputSchema: z.object({
        timeoutMs: z.number().int().positive().max(300000).optional().default(60000),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ timeoutMs }) => {
      try {
        const event = await client.waitForDecision(timeoutMs);
        const batch = artifacts.readBatch(event.batchId);
        return jsonResult({
          event,
          batch,
          resources: {
            batch: `feedback://batch/${event.batchId}`,
            summary: `feedback://summary/${event.batchId}`,
          },
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'set_feedback_overlay',
    {
      title: 'Set Feedback Overlay',
      description: 'Show or hide the UI feedback overlay in the connected app.',
      inputSchema: z.object({
        enabled: z.boolean(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ enabled }) => {
      try {
        await client.sendOverlayToggle(enabled);
        return jsonResult({ enabled });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'send_visual_suggestion',
    {
      title: 'Send Visual Suggestion',
      description:
        'Send an agent visual suggestion back into the live feedback overlay. If itemId is omitted, the first item in the batch is used.',
      inputSchema: z.object({
        batchId: z.string().optional().default('latest'),
        itemId: z.string().optional(),
        comment: z.string().min(1),
        patchHint: z.string().optional(),
        marks: z.array(markSchema).optional(),
      }),
    },
    async ({ batchId, itemId, comment, patchHint, marks }) => {
      const batch = resolveBatch(artifacts, batchId);
      if (!batch) return errorResult(`Feedback batch not found: ${batchId}`);
      const item = itemId ? batch.items.find((candidate) => candidate.id === itemId) : batch.items[0];
      if (!item) return errorResult(`Feedback item not found: ${itemId ?? '(first item)'}`);

      const normalizedMarks = (marks?.length ? marks : defaultMarks()).map(normalizeMark);
      try {
        const suggestion = await client.sendSuggestion({
          batchId: batch.id,
          itemId: item.id,
          comment,
          patchHint,
          marks: normalizedMarks,
        });
        return jsonResult({
          suggestion,
          batchId: batch.id,
          itemId: item.id,
          note: 'Suggestion sent to the live overlay. The user can accept, reject, or comment from the Thread panel.',
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return { server, client, artifacts };
}

export async function runFeedbackMcpServer(options: FeedbackMcpOptions): Promise<void> {
  const { server } = createFeedbackMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function resolveBatch(artifacts: FeedbackArtifacts, batchId: string): UiFeedbackBatch | null {
  return batchId === 'latest' ? artifacts.latestBatch() : artifacts.readBatch(batchId);
}

function normalizeMark(mark: z.infer<typeof markSchema>): AnnotationMark {
  return {
    id: mark.id ?? `agent_mark_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    type: mark.type,
    author: 'agent',
    createdAt: mark.createdAt ?? new Date().toISOString(),
    color: mark.color ?? '#16a34a',
    strokeWidth: mark.strokeWidth ?? 4,
    opacity: mark.opacity,
    bounds: mark.bounds,
    points: mark.points,
    text: mark.text,
  };
}

function defaultMarks(): Array<z.infer<typeof markSchema>> {
  return [
    {
      type: 'arrow',
      points: [
        { x: 260, y: 220 },
        { x: 520, y: 260 },
      ],
    },
    {
      type: 'rect',
      bounds: { x: 180, y: 140, width: 620, height: 210 },
    },
  ];
}

function jsonResult(data: JsonRecord) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}
