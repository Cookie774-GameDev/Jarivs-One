export type JarvisMemoryCategory =
  | 'response-style'
  | 'workflow'
  | 'tool'
  | 'project'
  | 'personal'
  | 'avoid';

export interface JarvisMemorySource {
  kind: 'explicit' | 'inferred';
  chatId?: string;
  messageId?: string;
}

export interface JarvisMemoryScope {
  kind: 'account' | 'workspace' | 'project';
  id: string;
}

export interface JarvisMemoryItem {
  id: string;
  category: JarvisMemoryCategory;
  value: string;
  confidence: number;
  source: JarvisMemorySource;
  scope: JarvisMemoryScope;
  createdAt: number;
  updatedAt: number;
}

export interface JarvisLearningProfile {
  accountId: string;
  enabled: boolean;
  items: JarvisMemoryItem[];
  meaningfulMessageCount: number;
  lastEvaluationCount: number;
  updatedAt: number;
}
