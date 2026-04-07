const timestamp = () => new Date().toISOString();

export const logger = {
  info: (tag, message) => console.log(`[${timestamp()}] [INFO] [${tag}] ${message}`),
  warn: (tag, message) => console.warn(`[${timestamp()}] [WARN] [${tag}] ${message}`),
  error: (tag, message, err) => {
    console.error(`[${timestamp()}] [ERROR] [${tag}] ${message}`);
    if (err) console.error(err);
  },
  debug: (tag, message) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[${timestamp()}] [DEBUG] [${tag}] ${message}`);
    }
  },
};