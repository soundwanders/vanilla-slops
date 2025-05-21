/**
 * Log a message to the console with a timestamp
 * 
 * @param {...any} args - The messages or objects to log
 * 
 * @returns {void}
 */
export function log(...args) {
  console.log(new Date().toISOString(), ...args);
}