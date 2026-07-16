import { resolveAction as defaultResolveAction, runAction as defaultRunAction } from '@/lib/actions';
import type { ActionDef, ActionResult, ActionRunContext } from '@/lib/actions/types';
import type { Message, Part } from '@/types';
import type { ChatId } from '@/types/common';
import {
  createJarvisTaskRun,
  useJarvisTaskRunStore,
} from '@/features/jarvis-runs/taskRunStore';
import { createTaskApprovalCallId } from '@/features/jarvis-runs/approvalBridge';
import { buildJarvisActionCatalog } from './actions/catalog';
import { createJarvisPlan } from './actions/planner';

import { interpretJarvisRequest } from './intentInterpreter';

interface OperatorSendDetail {
  chatId?: string;
  text?: string;
  filePaths?: unknown[];
  imageAttachments?: unknown[];
  terminalRefs?: unknown[];
  contextNodes?: unknown[];
  mentionedAgentIds?: unknown[];
  agentId?: unknown;
  structuredContext?: unknown;
  interactionMode?: string;
  speakReply?: boolean;
}

interface OperatorListenerBindings {
  appendMessage: (
    message: Omit<Message, 'id' | 'created_at' | 'updated_at'>,
  ) => Promise<unknown> | unknown;
  resolveAction?: (id: string) => ActionDef | undefined;
  runAction?: (
    id: string,
    params: Record<string, unknown>,
    context: ActionRunContext,
  ) => Promise<ActionResult>;
  onError?: (error: unknown) => void;
}

function contextual(detail: OperatorSendDetail): boolean {
  return Boolean(
    detail.agentId
    || detail.structuredContext
    || detail.speakReply
    || detail.interactionMode === 'agent'
    || detail.filePaths?.length
    || detail.imageAttachments?.length
    || detail.terminalRefs?.length
    || detail.contextNodes?.length
    || detail.mentionedAgentIds?.length,
  );
}

function report(bindings: OperatorListenerBindings, error: unknown): void {
  if (bindings.onError) bindings.onError(error);
  else console.error('[jarvis-operator] request failed', error);
}

/**
 * Deterministic operator path for high-confidence VibeSpace commands. It is
 * deliberately narrow: contextual or deferred plans continue to the full AI
 * runtime, while known safe commands and approval proposals never become fake
 * code or duplicate provider replies.
 */
export function startJarvisOperatorListener(
  bindings: OperatorListenerBindings,
  eventName = 'jarvis:send',
): () => void {
  const resolveAction = bindings.resolveAction ?? defaultResolveAction;
  const runAction = bindings.runAction ?? ((id, params, context) =>
    defaultRunAction(id, params, context, { emitToast: false }));

  const onSend = (event: Event) => {
    const detail = (event as CustomEvent<OperatorSendDetail>).detail;
    if (!detail?.chatId || typeof detail.text !== 'string' || contextual(detail)) return;
    const interpreted = interpretJarvisRequest(detail.text);
    const handlesWithoutActions = ['ambiguous', 'destructive-action', 'memory-update'].includes(interpreted.intent);
    if (!handlesWithoutActions && interpreted.steps.length === 0) return;
    if (interpreted.steps.some((step) => step.deferred)) {
      event.stopImmediatePropagation();
      const searchStep = interpreted.intent === 'file-work'
        ? interpreted.steps.find((step) => step.action === 'file.search' && !step.deferred)
        : undefined;
      const attachDefinition = resolveAction('file.attach');
      if (searchStep && resolveAction(searchStep.action) && attachDefinition) {
        void (async () => {
          const searchResult = await runAction(searchStep.action, searchStep.input, {
            source: 'ai',
            chatId: detail.chatId,
            callId: `file-search:${Date.now()}`,
          });
          if (!searchResult.ok) {
            await bindings.appendMessage({
              chat_id: detail.chatId as ChatId,
              role: 'assistant',
              parts: [{ kind: 'text', text: searchResult.error }],
            });
            return;
          }
          const results = typeof searchResult.data === 'object' && searchResult.data !== null
            && Array.isArray((searchResult.data as { results?: unknown }).results)
            ? (searchResult.data as { results: unknown[] }).results
            : [];
          const paths = [...new Set(results.map((item) =>
            item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string'
              ? (item as { path: string }).path.trim()
              : '',
          ).filter((path): path is string => Boolean(path)))].slice(0, 8);
          if (!paths.length) {
            await bindings.appendMessage({
              chat_id: detail.chatId as ChatId,
              role: 'assistant',
              parts: [{ kind: 'text', text: searchResult.summary || 'No matching files were verified.' }],
            });
            return;
          }
          const approvalRun = createJarvisTaskRun({
            chatId: detail.chatId,
            goal: 'Attach verified project files as chat context.',
            status: 'waiting-for-approval',
            steps: paths.map((path, index) => ({
              id: `step-${index + 1}`,
              action: 'file.attach',
              label: `Attach ${path.split(/[\\/]/).pop() || 'file'}`,
              input: { path },
              recoverable: false,
            })),
          });
          useJarvisTaskRunStore.getState().addRun(approvalRun);
          await bindings.appendMessage({
            chat_id: detail.chatId as ChatId,
            role: 'assistant',
            parts: [
              { kind: 'text', text: `Found ${paths.length} verified matching file${paths.length === 1 ? '' : 's'}. Approve the paths to add them as context.` },
              ...paths.map((path, index): Part => ({
                kind: 'action_proposal',
                call_id: createTaskApprovalCallId(approvalRun.id, `step-${index + 1}`),
                action_id: 'file.attach',
                params: { path },
                rationale: attachDefinition.description,
                status: 'pending',
              })),
            ],
          });
        })().catch((error) => report(bindings, error));
        return;
      }

      const missingInput = interpreted.intent === 'plugin-use'
        ? 'Which connected plugin and declared tool should I run?'
        : interpreted.intent === 'mcp-use'
          ? 'Which registered MCP server and declared tool should I use?'
          : 'I need the prior step’s verified output before I can safely continue.';
      void Promise.resolve(bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts: [{ kind: 'text', text: missingInput }],
      })).catch((error) => report(bindings, error));
      return;
    }

    const definitions = interpreted.steps.map((step) => resolveAction(step.action));
    const missing = interpreted.steps.find((_, index) => !definitions[index]);
    event.stopImmediatePropagation();

    if (missing) {
      void Promise.resolve(bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts: [{ kind: 'text', text: `I understood the request, but ${missing.action} is not available in this build.` }],
      })).catch((error) => report(bindings, error));
      return;
    }

    if (interpreted.steps.length === 0) {
      if (interpreted.intent === 'memory-update') return;
      void Promise.resolve(bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts: [{ kind: 'text', text: interpreted.response }],
      })).catch((error) => report(bindings, error));
      return;
    }

    try {
      // Validate the interpreter's requested action names and inputs against
      // the same typed contracts used by the planner before either automatic
      // execution or approval-card creation reaches a host handler.
      createJarvisPlan({
        goal: detail.text,
        requestedSteps: interpreted.steps,
        catalog: buildJarvisActionCatalog(definitions as ActionDef[]),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void Promise.resolve(bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts: [{ kind: 'text', text: `I could not validate that action safely: ${message}` }],
      })).catch((appendError) => report(bindings, appendError));
      return;
    }

    if (interpreted.execution !== 'automatic') {
      const approvalRun = createJarvisTaskRun({
        chatId: detail.chatId,
        goal: interpreted.response,
        status: 'waiting-for-approval',
        steps: interpreted.steps.map((step, index) => ({
          id: `step-${index + 1}`,
          action: step.action,
          label: definitions[index]?.label ?? step.action,
          input: step.input,
          recoverable: false,
        })),
      });
      useJarvisTaskRunStore.getState().addRun(approvalRun);
      const parts: Part[] = [{ kind: 'text', text: interpreted.response }];
      interpreted.steps.forEach((step, index) => {
        parts.push({
          kind: 'action_proposal',
          call_id: createTaskApprovalCallId(approvalRun.id, `step-${index + 1}`),
          action_id: step.action,
          params: step.input,
          rationale: definitions[index]?.description,
          status: 'pending',
        });
      });
      void Promise.resolve(bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts,
      })).catch((error) => report(bindings, error));
      return;
    }

    const run = createJarvisTaskRun({
      chatId: detail.chatId,
      goal: interpreted.response,
      status: 'running',
      steps: interpreted.steps.map((step, index) => ({
        id: `step-${index + 1}`,
        action: step.action,
        label: definitions[index]?.label ?? step.action,
        input: step.input,
        recoverable: definitions[index]?.autoApprove === true,
      })),
    });
    useJarvisTaskRunStore.getState().addRun(run);

    void (async () => {
      const summaries: string[] = [];
      for (const [index, step] of interpreted.steps.entries()) {
        const stepId = `step-${index + 1}`;
        useJarvisTaskRunStore.getState().updateStep(run.id, stepId, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });
        const actionResult = await runAction(step.action, step.input, {
          source: 'ai',
          chatId: detail.chatId,
          callId: createTaskApprovalCallId(run.id, stepId),
        });
        if (!actionResult.ok) {
          useJarvisTaskRunStore.getState().updateStep(run.id, stepId, {
            status: 'failed',
            error: actionResult.error,
            completedAt: new Date().toISOString(),
          });
          useJarvisTaskRunStore.getState().patchRun(run.id, {
            status: 'failed',
            activeAgents: [],
            activeTerminals: [],
            userVisibleSummary: actionResult.error,
          });
          await bindings.appendMessage({
            chat_id: detail.chatId as ChatId,
            role: 'assistant',
            parts: [{ kind: 'text', text: actionResult.error }],
          });
          return;
        }
        const summary = actionResult.summary?.trim();
        if (!summary) throw new Error(`${step.action} returned success without verification evidence.`);
        summaries.push(summary);
        useJarvisTaskRunStore.getState().updateStep(run.id, stepId, {
          status: 'completed',
          summary,
          completedAt: new Date().toISOString(),
        });
      }
      const completion = summaries.join(' ');
      useJarvisTaskRunStore.getState().patchRun(run.id, {
        status: 'completed',
        progress: 100,
        activeAgents: [],
        activeTerminals: [],
        userVisibleSummary: completion,
      });
      await bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts: [{ kind: 'text', text: completion }],
      });
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      useJarvisTaskRunStore.getState().patchRun(run.id, {
        status: 'failed',
        activeAgents: [],
        activeTerminals: [],
        userVisibleSummary: message,
      });
      try {
        await bindings.appendMessage({
          chat_id: detail.chatId as ChatId,
          role: 'assistant',
          parts: [{ kind: 'text', text: message }],
        });
      } catch (appendError) {
        report(bindings, appendError);
      }
    });
  };

  window.addEventListener(eventName, onSend);
  return () => window.removeEventListener(eventName, onSend);
}
