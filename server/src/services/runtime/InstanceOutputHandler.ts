export class InstanceOutputHandler {
  private logBuffers: Map<string, string[]> = new Map();

  /**
   * Processes a buffer chunk from the server output
   */
  handleOutput(id: string, chunk: Buffer, onLog?: (line: string) => void): void {
    const lines = chunk.toString().split('\n');
    const buffer = this.getOrCreateBuffer(id);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Memory Buffer management
      buffer.push(trimmed);
      if (buffer.length > 200) {
        buffer.shift();
      }

      // Live callback
      if (onLog) {
        onLog(trimmed);
      }
    }
  }

  /**
   * Returns the last 200 lines for an instance
   */
  getBuffer(id: string): string[] {
    return this.logBuffers.get(id) || [];
  }

  /**
   * Clears the buffer for an instance
   */
  clearBuffer(id: string): void {
    this.logBuffers.delete(id);
  }

  private getOrCreateBuffer(id: string): string[] {
    let buffer = this.logBuffers.get(id);
    if (!buffer) {
      buffer = [];
      this.logBuffers.set(id, buffer);
    }
    return buffer;
  }
}

export const instanceOutputHandler = new InstanceOutputHandler();
