interface Cause {
  code: number;
  reason: string;
}

export default class ModernWebSocket {
  readonly #socket: WebSocket;

  readonly closed: Promise<Cause>;
  readonly ready: Promise<void>;

  constructor(url: URL | string, options?: { protocols?: string | string[]; signal?: AbortSignal; }) {
    this.#socket = new WebSocket(url, options?.protocols ?? []);

    let readyDeferred = defer();
    this.ready = readyDeferred.promise;

    let closedDeferred = defer<Cause>();
    this.closed = closedDeferred.promise;

    let ready = false;

    this.#socket.addEventListener('open', () => {
      ready = true;
      readyDeferred.resolve();
    }, { once: true });

    this.#socket.addEventListener('close', (event) => {
      let cause = {
        code: event.code,
        reason: event.reason
      };

      if (event.wasClean) {
        closedDeferred.resolve(cause);
      } else {
        let err = (new Error(`Closed with code ${event.code}`)) as Cause & Error;
        Object.assign(err, cause);

        if (ready) {
          closedDeferred.reject(err);
        } else {
          readyDeferred.reject(err);
        }
      }
    });

    options?.signal?.addEventListener('abort', () => {
      this.#socket.close(1000);
    });
  }


  get binaryType() {
    return this.#socket.binaryType;
  }

  set binaryType(value: BinaryType) {
    this.#socket.binaryType = value;
  }

  get bufferedAmount() {
    return this.#socket.bufferedAmount;
  }

  get extensions() {
    return this.#socket.extensions;
  }

  get protocol() {
    return this.#socket.protocol;
  }

  get readyState() {
    return this.#socket.readyState;
  }

  get url() {
    return this.#socket.url;
  }


  async close(code?: number | undefined, reason?: string | undefined) {
    this.#socket.close(code, reason);
    await this.closed;
  }


  iter<T>(): AsyncIterator<T> & AsyncIterable<T> {
    let controller = new AbortController();
    let messageDeferred: Deferred<void> | null = null;
    let queue: T[] = [];

    this.#socket.addEventListener('message', (event) => {
      if (!messageDeferred) {
        return;
      }

      queue.push(event.data);
      messageDeferred?.resolve();
    }, { signal: controller.signal });

    let iter = {
      next: async () => {
        if (queue.length > 0) {
          return { done: false, value: queue.shift()! };
        }

        messageDeferred = defer();

        return await Promise.race([
          this.closed.then(() => ({ done: true, value: undefined as unknown as T })),
          messageDeferred.promise.then(() => ({ done: false, value: queue.shift()! }))
        ]);
      },
      return: async () => {
        controller.abort();
        return { done: true, value: undefined as unknown as T };
      }
    };

    this.closed.then(() => {
      queue = [];
    }, () => {});

    return {
      ...iter,
      [Symbol.asyncIterator]: () => iter
    };
  }

  send(message: ArrayBufferLike | ArrayBufferView | Blob | string) {
    this.#socket.send(message);
  }

  async listen<T = void>(func: (conn: { iter: ModernWebSocket['iter']; }) => Promise<T>): Promise<T> {
    await this.ready;

    try {
      return await func({
        iter: () => this.iter()
      });
    } catch (err) {
      this.#socket.close(4000);
      throw err;
    }
  }
}


export function defer<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];

  let promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return { promise, resolve, reject };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(err: any): void;
}
