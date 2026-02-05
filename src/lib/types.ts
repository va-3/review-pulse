// portfolio/review-pulse/types.ts

export interface RAGRequest {
  query: string;
  context?: string[]; // Optional history
}

export interface RAGResponse {
  answer: string;
  sources: string[];
  latency_ms: number;
}

export interface IngestRequest {
  filename: string;
  content: string; // Base64 or raw text
}

export interface IngestResponse {
  chunks: number;
  docId: string;
  status: 'success' | 'error';
}

export interface VapiToolCall {
  function: {
    name: string;
    arguments: string; // JSON string
  };
  id: string;
}

export interface VapiToolResponse {
  results: [
    {
      toolCallId: string;
      result: string;
    }
  ];
}
