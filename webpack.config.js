/** Keep native and queue packages outside the Nest webpack bundle. */
module.exports = (options) => {
  const extra = {
    sharp: 'commonjs sharp',
    bullmq: 'commonjs bullmq',
  };
  const current = options.externals;
  return {
    ...options,
    externals: Array.isArray(current) ? [...current, extra] : [current, extra].filter(Boolean),
  };
};
