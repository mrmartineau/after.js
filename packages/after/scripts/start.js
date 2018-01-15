#! /usr/bin/env node
'use strict';

process.env.NODE_ENV = 'development';
const fs = require('fs-extra');
const webpack = require('webpack');
const paths = require('../config/paths');
const path = require('path');
const createConfig = require('../config/createConfig');
const devServer = require('webpack-dev-server');
const printErrors = require('razzle-dev-utils/printErrors');
const clearConsole = require('react-dev-utils/clearConsole');
const logger = require('razzle-dev-utils/logger');
const chokidar = require('chokidar');

process.noDeprecation = true; // turns off that loadQuery clutter.

if (process.argv.includes('--inspect')) {
  process.env.INSPECT_ENABLED = true;
}

// Optimistically, we make the console look exactly like the output of our
// FriendlyErrorsPlugin during compilation, so the user has immediate feedback.
// clearConsole();
logger.start('Compiling...');
let razzle = {};

// Check for razzle.config.js file
if (fs.existsSync(paths.appRazzleConfig)) {
  try {
    razzle = require(paths.appRazzleConfig);
  } catch (e) {
    clearConsole();
    logger.error('Invalid razzle.config.js file.', e);
    process.exit(1);
  }
}

// Delete assets.json to always have a manifest up to date
fs.removeSync(paths.appManifest);

// Create dev configs using our config factory, passing in razzle file as
// options.
let clientConfig = createConfig('web', 'dev', razzle);
let serverConfig = createConfig('node', 'dev', razzle);

// Check if razzle.config has a modify function. If it does, call it on the
// configs we just created.
if (razzle.modify) {
  clientConfig = razzle.modify(
    clientConfig,
    { target: 'web', dev: true },
    webpack
  );
  serverConfig = razzle.modify(
    serverConfig,
    { target: 'node', dev: true },
    webpack
  );
}

Promise.resolve()
  .then(async () => {
    await fs.copy(path.join(__dirname, '../lib'), paths.appTemp + '/src', {
      overwrite: true,
    });

    try {
      await fs.copy('src', paths.appTemp + '/src', { overwrite: true });
    } catch (error) {
      console.log('Please create a src directory in the root of your project');
      process.exit(1);
    }

    try {
      await fs.copy('public', paths.appTemp + '/public', { overwrite: true });
    } catch (e) {}

    const tempSrc = paths.appTemp + '/src';

    const serverCompiler = compile(serverConfig);

    // Start our server webpack instance in watch mode.
    serverCompiler.watch(
      {
        quiet: true,
        stats: 'none',
      },
      /* eslint-disable no-unused-vars */
      stats => {}
    );

    // Compile our assets with webpack
    const clientCompiler = compile(clientConfig);

    // Create a new instance of Webpack-dev-server for our client assets.
    // This will actually run on a different port than the users app.
    const clientDevServer = new devServer(
      clientCompiler,
      clientConfig.devServer
    );

    // Start Webpack-dev-server
    clientDevServer.listen(
      (process.env.PORT && parseInt(process.env.PORT) + 1) ||
        razzle.port ||
        3001,
      err => {
        if (err) {
          logger.error(err);
        }
      }
    );

    chokidar
      .watch('src', { ignored: /(^|[\/\\])\../ })
      .on('change', changedPath => {
        fs.copyFile(changedPath, tempSrc.replace('src', changedPath), err => {
          if (err) {
            console.log(err);
          }
        });
      });
  })
  .catch(e => console.log(e));

// Webpack compile in a try-catch
function compile(config) {
  let compiler;
  try {
    compiler = webpack(config);
  } catch (e) {
    printErrors('Failed to compile.', [e]);
    process.exit(1);
  }
  return compiler;
}
