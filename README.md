# redis-ws-alerts [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][daviddm-image]][daviddm-url]
Alerting clients over express-bound websockets of events posted to redis lists.

## Installation

Add redis-ws-alerts to your project (we assume you have pre-installed [node.js](https://nodejs.org/)).

```bash
yarn add redis-ws-alerts
```

## How Does It Work?

There's a few things to state up front: This module takes pushed messages from redis lists and forwards them to clients connected over web sockets. Yes, there are some conventions in play, but nothing too burdensome. Of note, publishers of pushed messages must first append to the named list, then push the name of the list onto the tail of the well-known queue specified as the second argument when constructing a connected-content. As well, connected clients must send an 'identify' message to the connection-server with the persistent name of the client. This name serves as the key for the list in redis that holds the messages being forwarded. Queued messages stay queued in the named list until the client with the matching identity connects. Finally, you control the publishing and you control the receiving; utilize a consistent naming scheme and things should work nicely.

We expect to mount to an express app instance. The following example outlines a simple server:

```javascript
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

## License

ISC © [Kirk Bulis](http://github.com/kbulis)

[npm-image]: https://badge.fury.io/js/redis-ws-alerts.svg
[npm-url]: https://npmjs.org/package/redis-ws-alerts
[travis-image]: https://travis-ci.org/kbulis/redis-ws-alerts.svg?branch=master
[travis-url]: https://travis-ci.org/kbulis/redis-ws-alerts
[daviddm-image]: https://david-dm.org/kbulis/redis-ws-alerts.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/kbulis/redis-ws-alerts
