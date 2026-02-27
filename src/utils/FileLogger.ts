export class FileLogger {
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private adapter: { write: (path: string, content: string) => Promise<void>; read: (path: string) => Promise<string> },
    private filePath: string,
    private flushIntervalMs = 2000,
  ) {}

  start(): void {
    this.buffer = [];
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  log(message: string): void {
    const ts = performance.now().toFixed(2);
    this.buffer.push(`${ts}\t${message}`);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer.splice(0);
    try {
      let existing = '';
      try { existing = await this.adapter.read(this.filePath); } catch { /* new file */ }
      await this.adapter.write(this.filePath, existing + chunk.join('\n') + '\n');
    } catch (e) {
      console.error('[FileLogger] flush failed:', e);
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  async clear(): Promise<void> {
    try { await this.adapter.write(this.filePath, ''); } catch { /* ignore */ }
  }
}
