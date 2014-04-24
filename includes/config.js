var config = {

  guessEnv: function() {
    return "development";
  },

  getEnvironments: function() {
    if (this.environments === undefined) {
      this.environments = this.loadEnvironments();
    }
    return this.environments;
  },

  availableEnvironments: function() {
    var envs = this.getEnvironments();
    var envNames = [];
    for (key in envs) {
      if (envs.hasOwnProperty(key)) {
        envNames.push(key);
      }
    }
    return envNames;
  },

  loadEnvironments: function() {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../config.json")));
  },

  get: function(env) {
    var config, envs = this.getEnvironments();
    if (env === undefined) {
      env = this.guessEnv();
    }
    config = envs[env];
    if (config === undefined) {
      throw "Could not laod configuration named '" + env + "'. \
        Known environments are: [" + this.availableEnvironments()  + "]" ;
    }
    return config;
  }
};

module.exports = config.get();
