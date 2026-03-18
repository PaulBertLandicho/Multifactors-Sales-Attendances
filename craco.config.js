module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.module.rules = webpackConfig.module.rules.map((rule) => {
        if (rule.enforce === 'pre' && String(rule.loader || '').includes('source-map-loader')) {
          const currentExclude = Array.isArray(rule.exclude)
            ? rule.exclude
            : rule.exclude
              ? [rule.exclude]
              : [];

          return {
            ...rule,
            exclude: [...currentExclude, /face-api\.js/],
          };
        }

        return rule;
      });

      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        fs: false,
      };

      return webpackConfig;
    },
  },
};