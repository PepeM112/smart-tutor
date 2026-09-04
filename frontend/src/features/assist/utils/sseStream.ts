export type SSECallback = (eventType: string, data: unknown) => void;

export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: SSECallback
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        try {
          const data: unknown = JSON.parse(line.slice(6));
          onEvent(eventType, data);
        } catch {
          // Skip malformed SSE events instead of aborting the stream
        }
        eventType = '';
      }
    }
  }
}
