import type { ChatMessage } from '../lib/llm';

export interface PromptModule<Args> {
  id: string;
  version: string;
  temperature: number;
  build: (args: Args) => ChatMessage[];
}

export function promptTag(id: string, version: string): string {
  return `${id}@${version}`;
}
