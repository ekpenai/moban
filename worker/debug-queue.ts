import Queue from 'bull';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

async function debug() {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  };

  console.log(`Connecting to Redis: ${connection.host}:${connection.port}`);
  const queue = new Queue('renderQueue', { redis: connection });

  const counts = await queue.getJobCounts();
  console.log('Queue Status:', JSON.stringify(counts, null, 2));

  const jobs = await queue.getJobs(['waiting', 'active', 'failed'], 0, 10);
  console.log(`Found ${jobs.length} jobs in queue:`);
  
  jobs.forEach(j => {
    console.log(`- Job ID: ${j.id}, Name: ${j.name}, State: ${j.failedReason || 'ok'}`);
  });

  process.exit();
}

debug();
