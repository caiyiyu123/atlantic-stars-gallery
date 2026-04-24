const MAX_CONCURRENT = 1;
const queue = [];
let running = 0;

function enqueue(jobId, worker) {
  queue.push({ jobId, worker });
  tick();
}

function tick() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const { jobId, worker } = queue.shift();
    running++;
    Promise.resolve()
      .then(() => worker(jobId))
      .catch((err) => console.error(`[aiJobQueue] job ${jobId} 异常:`, err.message))
      .finally(() => {
        running--;
        tick();
      });
  }
}

function stats() {
  return { queued: queue.length, running, maxConcurrent: MAX_CONCURRENT };
}

module.exports = { enqueue, stats };
