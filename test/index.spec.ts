import * as chai from 'chai';
import * as mock from 'redis-queue-mock';
import { ConnectedContent } from '../lib';

describe('initializes connected content and tests redis interface', () => {

  const connectedContent: ConnectedContent = new ConnectedContent('mocks://mocked', 'watch');
  const mocked = mock.createClient('mocks://mocked');

  it('should receive published queue messages', (done) => {
    let count = 0;

    connectedContent.onFetch = (key: string, message: string) => {
      if (++count === 3) {
        done();
      }
    };

    mocked.rpush('key-one', JSON.stringify({
      event: 'alert',
      value: 'message from one',
    }));

    mocked.rpush('key-two', JSON.stringify({
      event: 'alert',
      value: 'message from two',
    }));

    mocked.rpush('key-one', JSON.stringify({
      event: 'alert',
      value: 'another from one',
    }));

    mocked.rpush('watch', 'key-one');
    mocked.rpush('watch', 'key-two');
    mocked.rpush('watch', 'key-one');
  });

  after(() => {
    connectedContent.close();
    mocked.quit();
  });

});
