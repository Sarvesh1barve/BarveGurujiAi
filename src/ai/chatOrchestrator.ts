import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { AppSettings, VerifiedContext } from "../types/domain";
import type { ChatMessage, StoredAttachment } from "../types/storage";
import { resolveRelativeDate } from "../utils/dateResolution";
import { GURUJI_SYSTEM_PROMPT, languageInstruction } from "../prompts/gurujiSystemPrompt";
import { attachmentsToParts } from "./attachmentService";
import { MAX_HISTORY_CHARACTERS, MAX_HISTORY_MESSAGES } from "./modelConfig";
import { GeminiUserError, inspectFinishReason, mapGeminiError } from "./responseErrors";

function contextBlock(context: VerifiedContext): string {
  return `<VERIFIED_CONTEXT>\n${JSON.stringify(context, null, 2)}\n</VERIFIED_CONTEXT>`;
}

export function buildAlternatingHistory(messages: ChatMessage[], throughUserMessageId: string): Content[] {
  const eligible = messages
    .filter((message) => message.role !== "calculation" && message.status === "complete")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const end = eligible.findIndex(({ id }) => id === throughUserMessageId);
  if (end < 0 || eligible[end]?.role !== "user") throw new Error("The current user message is missing from history.");
  let recent = eligible.slice(0, end + 1).slice(-MAX_HISTORY_MESSAGES);
  while (recent.length && recent[0]?.role !== "user") recent = recent.slice(1);
  while (recent.reduce((sum, message) => sum + message.content.length, 0) > MAX_HISTORY_CHARACTERS && recent.length > 2) recent = recent.slice(2);

  const contents: Content[] = [];
  for (const message of recent) {
    const role = message.role === "assistant" ? "model" : "user";
    const previous = contents.at(-1);
    if (previous?.role === role) {
      const previousText = previous.parts?.map((part) => "text" in part ? part.text : "").join("\n") ?? "";
      previous.parts = [{ text: `${previousText}\n\n${message.content}` }];
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }
  return contents;
}

export interface StreamChatOptions {
  apiKey: string;
  settings: AppSettings;
  messages: ChatMessage[];
  currentUserMessage: ChatMessage;
  verifiedContext: VerifiedContext;
  attachments: StoredAttachment[];
  signal: AbortSignal;
  onStatus: (status: string) => void;
  onText: (text: string) => void;
}

export async function streamGurujiResponse(options: StreamChatOptions): Promise<string> {
  const { apiKey, settings, currentUserMessage, verifiedContext, attachments, signal, onStatus, onText } = options;
  if (!navigator.onLine) throw new GeminiUserError("network", "AI answers need internet access. Your question is saved locally.");
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildAlternatingHistory(options.messages, currentUserMessage.id);
  const latest = contents.at(-1);
  if (!latest || latest.role !== "user") throw new Error("Chat history must end with one user turn.");

  const resolved = resolveRelativeDate(currentUserMessage.content, new Date(), settings.location.timezone);
  const mediaParts = await attachmentsToParts(apiKey, attachments, signal, onStatus);
  const attachmentNote = attachments.length ? `\n\nAttached sources: ${attachments.map(({ fileName }) => fileName).join(", ")}. Distinguish visible source content from interpretation and never invent page references.` : "";
  const textPart: Part = { text: `${resolved.resolvedText}\n\n${contextBlock(verifiedContext)}${attachmentNote}` };
  latest.parts = [textPart, ...mediaParts];
  onStatus("Guruji is composing");

  let output = "";
  let finishReason: string | undefined;
  let blockReason: string | undefined;
  try {
    const stream = await ai.models.generateContentStream({
      model: settings.model,
      contents,
      config: {
        systemInstruction: `${GURUJI_SYSTEM_PROMPT}\n\n${languageInstruction(settings.language)}`,
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 3_000,
        abortSignal: signal,
      },
    });
    for await (const chunk of stream) {
      const text = chunk.text ?? "";
      if (text) { output += text; onText(text); }
      finishReason = chunk.candidates?.[0]?.finishReason;
      blockReason = chunk.promptFeedback?.blockReason;
    }
    inspectFinishReason(finishReason, blockReason, Boolean(output.trim()));
    if (!output.trim()) throw new GeminiUserError("empty", "Gemini returned an empty response.");
    return output.trim();
  } catch (error) {
    throw mapGeminiError(error);
  }
}

export async function testGeminiConnection(apiKey: string, model: string, signal?: AbortSignal): Promise<void> {
  try {
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({ model, contents: "Reply only with OK.", config: { maxOutputTokens: 5, temperature: 0, abortSignal: signal } });
    inspectFinishReason(response.candidates?.[0]?.finishReason, response.promptFeedback?.blockReason, Boolean(response.text?.trim()));
  } catch (error) { throw mapGeminiError(error); }
}
