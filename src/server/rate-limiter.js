/**
 * @param {number} limit - max number of concurrent tasks
 * @returns {Function} - Schedule tasks with controlled concurrency
 */
function createRateLimiter(limit) {
  let activeCount = 0;

  // Queue of tasks waiting to be executed
  const queue = [];

  const next = () => {
    if (queue.length > 0 && activeCount < limit) {
      const task = queue.shift(); // Remove first task in queue
      activeCount++;
      task().finally(() => {
        activeCount--;
        next();
      });
    }
  };

  return function runTask(fn) {
    return new Promise((resolve, reject) => {
      const task = () =>
        fn().then(resolve).catch(reject); // Wrap task with resolve/reject handling
      queue.push(task);
      next(); // Process tasks if still UNDER the limit
    });
  };
}

module.exports = createRateLimiter;
