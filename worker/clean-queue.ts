import Queue from 'bull';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

async function clean() {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };

  const queue = new Queue('renderQueue', { redis: connection });
  
  console.log('Cleaning active/wait/failed jobs...');
  await queue.clean(0, 'active');
  await queue.clean(0, 'wait');
  await queue.clean(0, 'failed');
  await queue.empty();
  
  console.log('Queue is now EMPTY.');
  process.exit();
}

clean();
