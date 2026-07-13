module.exports = {
  getBuildTimeServerManifestAsync: async () => ({
    htmlPrefix: '',
    routeNode: {
      type: 'layout',
      route: '',
      children: [], 
      screens: {},
      initialRouteName: undefined,
    },
    apiRoutes: [],
    assets: [],
  }),
  renderAsync: async () => '<html><body></body></html>',
};