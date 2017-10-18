const makeDebug = require('debug');
const Proto = require('uberproto');
const commons = require('feathers-socket-commons');
const Primus = require('primus');
const http = require('http');
const Emitter = require('primus-emitter');

const debug = makeDebug('feathers-primus');
const socketKey = Symbol('feathers-primus/socket');

module.exports = function (config, configurer) {
  return function () {
    const app = this;
    const getParams = spark => spark.request.feathers;

    const done = new Promise(resolve => {
      Proto.mixin({
        listen (...args) {
          if (typeof this._super === 'function') {
            // If `listen` already exists
            // usually the case when the app has been expressified
            return this._super(...args);
          }

          const server = http.createServer();

          this.setup(server);

          return server.listen(...args);
        },

        setup (server) {
          debug('Setting up Primus');

          if (!this.primus) {
            const primus = this.primus = new Primus(server, config);

            primus.plugin('emitter', Emitter);

            primus.use('feathers', function (req, res, next) {
              req.feathers = { provider: 'primus' };

              next();
            }, 0);

            primus.on('connection', spark =>
              Object.defineProperty(getParams(spark), socketKey, {
                value: spark
              })
            );

            primus.on('disconnection', spark => {
              const { channels } = app;

              if (channels.length) {
                app.channel(app.channels).leave(getParams(spark));
              }
            });

            // In Feathers it is easy to hit the standard Node warning limit
            // of event listeners (e.g. by registering 10 services).
            // So we set it to a higher number. 64 should be enough for everyone.
            primus.setMaxListeners(64);
          }

          if (typeof configurer === 'function') {
            debug('Calling Primus configuration function');
            configurer.call(this, this.primus);
          }

          resolve(this.primus);

          return this._super.apply(this, arguments);
        }
      }, app);
    });

    app.configure(commons({
      done,
      socketKey,
      getParams,
      emit: 'send'
    }));
  };
};

module.exports.SOCKET_KEY = socketKey;