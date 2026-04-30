export class ChatQueue {
  private readonly chains = new Map<string, Promise<unknown>>();

  enqueue<T>(chatId: string, job: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(chatId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(job)
      .finally(() => {
        if (this.chains.get(chatId) === next) this.chains.delete(chatId);
      });
    this.chains.set(chatId, next);
    return next;
  }
}
