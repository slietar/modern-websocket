# modern-websocket

`modern-websocket` is a small wrapper around the standard [`WebSocket` class](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) that provides a modern interface (i.e. async iterators, promises, abort controllers) similar to that of [WebTransport](https://web.dev/webtransport/). It does not offer any additional functionality compared to its standard counterpart.


## Installation

```sh
$ npm install modern-websocket
```


## Usage

### Creating a connection

```js
import ModernWebSocket from 'modern-websocket';

// This controller can be used later on to close the connection.
let controller = new AbortController();

let socket = new ModernWebSocket('ws://localhost:1234', {
  protocols: ['...'], // Defaults to [] as the WebSocket constructor.
  signal: controller.signal
});
```

### Listening for messages

Messages are obtained using an asynchronous iterator:

```js
for await (let message of socket.iter()) {
  processMessage(message);
}

let { done, value: message } = await socket.iter().next();
```

If the connection is closed while waiting for a message, the corresponding promise will be resolved and the iterator will end gracefully if the connection closed cleanly, otherwise the promise will reject in the same circumstances as `socket.closed`. The promise is never fulfilled if the connection could not be established.

If the connection is closed while not waiting for a message (e.g. while processing the previous message), buffered messages will not be yielded and the behavior described above will occur when awaiting the next message.

### Sending messages

```js
socket.send(message);
```

### Listening for status changes

Status changes can be detected using promises:

```js
socket.ready.then(() => { ... });
socket.closed.then(() => { ... });
```

When the connection closes, `socket.closed` will be resolved if the connection [closed cleanly](https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.4), and will be rejected otherwise. The code and reason invoked can be obtained from the resolved object or rejected error, respectively.

```js
socket.closed.then((result) => {
  result.code
  result.reason
}, (err) => {
  err.code
  err.reason
});
```

If the connection to the server cannot be established or if the socket is closed (i.e. with `socket.close()`) before the connection can be established, `socket.ready` will be rejected in the same circumstances as would otherwise be `socket.closed`, and the latter will instead remain unfulfilled.

The absence of listeners on these promises will lead to uncaught rejection errors when they are rejected.

### Closing the connection

Unlike its standard counterpart, `socket.close()` is asynchronous as it awaits `socket.closed`, and will be rejected in the same conditions as `socket.closed`. Calling `socket.close()` multiple times or when the connection is already closed is a no-op.

When aborting the signal provided to the constructor, the socket will be closed with the [code 1000 (normal closure)](https://datatracker.ietf.org/doc/html/rfc6455#section-7.4.1) instead of the default code 1005 used when calling `socket.close()` with no arguments.

```js
await socket.close();
await socket.close(code, reason);

// or

controller.abort();
```

### Using other WebSocket properties

Standard `WebSocket` properties such as `binaryType` or `bufferedAmount`, among others, all behave as expected.

### Using listen()

`listen()` is a small wrapper used to simplify communication. In particular:

- It first awaits `socket.ready` and will thus wait for the connection to be established before calling its handler. The promise returned will also be rejected in the same conditions as `socket.ready`.
- If an error is thrown by the handler, the connection will be subsequently closed with error code 4000 and the promise returned by `listen()` will be rejected with that error.
- The returned value of the handler will be returned by `listen()` itself.

```js
await socket.listen(async (conn) => {
  for await (let message of conn.iter()) {

  }

  let { done, value } = await conn.iter().next();
});
```

### Closing the connection when the page closes

It is good practice to close the connection when the page enters the frozen (through the `freeze` event) or terminated (through the `pagehide` event) states as defined by the [Page Lifecycle API](https://developer.chrome.com/blog/page-lifecycle-api/) in order to [avoid blocking the back/forward cache](https://web.dev/bfcache/#always-close-open-connections-before-the-user-navigates-away).

```js
let socket;

// The 'pageshow' event is triggered both when loading a new page and when
// restoring a terminated page.
window.addEventListener('pageshow', () => {
  socket = new ModernWebSocket();
});

window.addEventListener('freeze', () => {
  // Note that the 'socket.ready' promise will be rejected if the connection
  // had not been established yet.
  socket?.close();
});

window.addEventListener('pagehide', () => {
  socket?.close();
});
```
