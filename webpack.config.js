/** Keep native/dynamic packages out of the Nest webpack bundle. */
module.exports = (options) => {
  const existing = options.externals;
  const externals = Array.isArray(existing)
    ? existing
    : existing
      ? [existing]
      : [];
  return {
    ...options,
    externals: [
      ...externals,
      { jimp: 'commonjs jimp' },
    ],
  };
};
