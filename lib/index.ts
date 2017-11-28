import * as express from 'express';
import * as storage from 'redis';
import * as mocking from 'redis-queue-mock';
import * as sockets from 'ws';

/**
 * ConnectionServer
 * 
 * Maintains websocket client connections for subsequently pushed alert
 * messages raised by a connected-content source (like redis list pop).
 * 
 * Example usage:
 * 
 * const server = new ConnectionServer(app, port);
 * 
 * server.onReady = (key: string, isInitial: boolean) => {
 *   // handle new client as key, noting initial readiness
 * };
 * 
 * server.onClose = (key: string, remaining: boolean) => {
 *   // handle dropped client as key, noting status
 * };
 * 
 * server.onError = (err: Error) => {
 *   // record error in logs...
 * };
 * 
 * ...
 * 
 * server.close();
 * 
 */
export class ConnectionServer {

  private server: sockets.Server;
  private lookup: any[] = [];

  private handleNewConnect = (connected: any, req: express.Request): void => {
    connected.trackingId = 'c' + (Math.floor(Math.random() * 9000000) + 1000000);
    connected.key = '';

    this.lookup.push(connected);

    connected.on('message', (message: string) => {
      try {
        const identify = JSON.parse(message || '{}');
  
        if (identify.event === 'identify') {
          if (identify.pcode && identify.ucode) {
            if (connected.key !== '') {
              if (connected.key !== 'alert/' + identify.pcode + '-' + identify.ucode) {
                if (this.onClose) {
                  try {
                    this.onClose(connected.key, this.lookup.some((tracked) => {
                      return tracked.key === connected.key && tracked.trackingId !== connected.trackingId;
                    }));
                  }
                  catch (eX) {
                  }
                }
              }
              else {
                return;
              }
            }

            connected.key = 'alert/' + identify.pcode + '-' + identify.ucode;

            connected.send(JSON.stringify({
              message: 'you are now connected',
            }));

            if (this.onReady) {
              try {
                this.onReady(connected.key, !this.lookup.some((tracked) => {
                  return tracked.key === connected.key && tracked.trackingId !== connected.trackingId;
                }));
              }
              catch (eX) {
              }
            }
          }
        }
      }
      catch (eX) {
      }
    });
  
    connected.on('error', (err: any) => {
      if (this.onError) {
        try {
          this.onError(err);
        }
        catch (eX) {
        }
      }
    });

    connected.on('close', () => {
      this.lookup = this.lookup.filter((tracked) => {
        return tracked.trackingId !== connected.trackingId;
      });

      if (this.onClose) {
        try {
          this.onClose(connected.key, this.lookup.some((tracked) => {
            return tracked.key === connected.key;
          }));
        }
        catch (eX) {
        }
      }
    });
  };

  pushNotification = (key: string, message: any): void => {
    for (const connected of this.lookup) {
      if (connected.key === key) {
        try {
          connected.send(JSON.stringify(message));
        }
        catch (eX) {
          if (this.onError) {
            try {
              this.onError(eX);
            }
            catch (oX) {
            }
          }
        }
      }
    }
  };

  onReady: (key: string, isInitial: boolean) => void;

  onClose: (key: string, remaining: boolean) => void;

  onError: (err: Error) => void;

  onStart: () => void;

  close = (): void => {
    try {
      this.server.close();
    }
    catch (eX) {
    }
  };

  constructor(app: express.Application, port: string) {
    this.server = new sockets.Server({
      server: app.listen(port)
    });

    this.server.on('connection', this.handleNewConnect);

    this.server.on('error', (err: any) => {
      if (this.onError) {
        try {
          this.onError(err);
        }
        catch (eX) {
        }
      }
    });
    
    this.server.on('listening', () => {
      if (this.onStart) {
        try {
          this.onStart();
        }
        catch (eX) {
        }
      }
    });
  }

}

/**
 * ConnectedContent
 * 
 * Watches a redis sink list and pops alert messages from the queue named
 * on the top of the sink. Once a client to redis is established, we watch
 * the sink as a queue by blocking on a list pop until an alert queue key
 * is pushed. Once pushed, the key name is popped off the sink of keys,
 * then the alert message is popped of the queue named by the key.
 * 
 * When used with a connection-server, you can push the alert message from
 * the named queue to a connected client with the same queue name. 
 * 
 * Example usage:
 * 
 * const listen = new ConnectedContent('redis://localhost:6379', 'watch');
 * 
 * listen.onFetch = (key: string, message: string) => {
 *   // consider key as source and message as payload...
 * };
 * 
 * listen.onError = (err: Error) => {
 *   // record error in logs...
 * };
 * 
 * ...
 * 
 * listen.close();
 * 
 */
export class ConnectedContent {

  private client: any;
  private listen: string;

  private consumeFromQueue = (): void => {
    this.client.blpop(this.listen, 0, (bad: any, key: any) => {
      if (!bad && key) {
        if (key.length === 2) {
          this.client.lpop(key[1], (err: any, message: any) => {
            if (!err && message) {
              const next = JSON.parse(message);
              if (next.event === 'alert') {
                if (this.onFetch) {
                  try {
                    this.onFetch(key[1], {
                      ...next,
                    });
                  }
                  catch (eX) {
                  }
                }
              }                  
            }
          });
        }
      }
      
      this.consumeFromQueue();
    });
  }

  onFetch: (key: string, message: any) => void;

  onError: (err: Error) => void;

  onStart: () => void;

  close = (): void => {
    try {
      this.client.quit();
    }
    catch (eX) {
    }
  };

  constructor(connect: string, listen: string) {
    // A bit of a hack here to support simple unit testing... We don't initialize
    // until we know the connection string protocol; 'mocks' is reserved for our
    // unit testing purposes. We assume that neither module initializes anything
    // on import alone. Note that multiple mocked clients all use the same mock
    // instance of redis.

    if (connect.toLowerCase().startsWith('mocks://') === false) {
      this.client = storage.createClient(connect, {
        retry_strategy: (options: storage.RetryStrategyOptions) => {
          return 5000;
        }
      });
    }
    else {
      this.client = mocking.createClient(connect);
    }

    this.listen = listen;
    
    this.client.on('error', (err: any) => {
      if (this.onError) {
        try {
          this.onError(err);
        }
        catch (eX) {
        }
      }
    });

    this.client.on('ready', () => {
      if (this.onStart) {
        try {
          this.onStart();
        }
        catch (eX) {
        }
      }

      this.consumeFromQueue();
    });
  }

}
