export const log = (msg, data) => {
  const time = new Date().toISOString();
  console.log(`[${time}] ${msg}`, data || '');
};
