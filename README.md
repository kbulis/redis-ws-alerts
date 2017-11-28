# redis-ws-alerts [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][daviddm-image]][daviddm-url]
Alerting clients over express-bound websockets of events posted to redis lists.

## Installation

Add redis-ws-alerts to your project (we assume you have pre-installed [node.js](https://nodejs.org/)).

```bash
yarn add redis-ws-alerts
```

## How Does It Work?

There's a few things to state up front: This module takes pushed messages from redis lists and forwards them to clients connected over web sockets. Yes, there are some conventions in play, but nothing too burdensome. Of note, publishers of pushed messages must first append to the named list, then push the name of the list onto the tail of the well-known queue specified as the second argument when constructing a connected-content. As well, connected clients must send an 'identify' message to the connection-server with the persistent name of the client. This name serves as the key for the list in redis that holds the messages being forwarded. Queued messages stay queued in the named list until the client with the matching identity connects. Finally, you control the publishing and you control the receiving; utilize a consistent naming scheme and things should work nicely.

With three contexts in play (publishing, popping and dispatching, then receiving), we can set up connected web client alerting with the following:

### Popping and Dispatching

```typescript
import * as express from 'express';
import * as alerter from 'redis-ws-alerts';

const app: express.Application = express();

...

const listen = new alerter.ConnectedContent('redis://localhost:6379', 'watch');
const server = new alerter.ConnectionServer(app, 3001);

listen.onFetch = (key: string, queuedMessage: any) => {
  server.pushNotification(key, queuedMessage);
}

server.onReady = (key: string, isInitial: boolean) => {
  console.log('- ready ' + key + ' ' + isInitial);
};

server.onClose = (key: string, remaining: boolean) => {
  console.log('- close ' + key + ' ' + remaining);
};

process.on("exit", function () {
  server.close();
  listen.close();
});
```

### Publishing

```typescript
import * as storage from 'redis';

const client = storage.createClient('redis://localhost:6379', {
  retry_strategy: (options: storage.RetryStrategyOptions) => {
    return 10000;
  }
});

...

const customerKey = 'alert/' + customerPoolCode + '-' + customerUniqueCode;

const messageA = {
  message: 'An alert for some customer',
  propX: 'Another property of the message',
  propY: 123,
  recordedOn: new Date(),
};

const messageB = {
  message: 'Another alert for some customer',
  propZ: 456,
  recordedOn: new Date(),
};

client.rpush(customerKey, JSON.stringify({
  event: 'alert',
  ...messageA
}));

client.rpush(customerKey, JSON.stringify({
  event: 'alert',
  ...messageB
}));

client.rpush('watch', customerKey);
client.rpush('watch', customerKey);
```

### Receiving

```javascript
const socket = new WebSocket('ws://localhost:3001/myapp');

socket.onmessage = (message) => {
  const data = JSON.parse(message.data || '{}');

  if (data.message) {
    console.log('received: ' + data.message);
  }
};

socket.onopen = () => {
  socket.send(JSON.stringify({
    event: 'identify',
    queue: 'alert/' + customerPoolCode + '-' + customerUniqueCode,
  }));
};
```

## License

ISC © [Kirk Bulis](http://github.com/kbulis)

[npm-image]: https://badge.fury.io/js/redis-ws-alerts.svg
[npm-url]: https://npmjs.org/package/redis-ws-alerts
[travis-image]: https://travis-ci.org/kbulis/redis-ws-alerts.svg?branch=master
[travis-url]: https://travis-ci.org/kbulis/redis-ws-alerts
[daviddm-image]: https://david-dm.org/kbulis/redis-ws-alerts.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/kbulis/redis-ws-alerts
