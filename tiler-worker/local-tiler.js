"use strict";

var fs = require("fs"),
    os = require("os"),
    path = require("path"),
    util = require("util");

var decider = require("swfr").decider,
    Promise = require("bluebird"),
    rimraf = require("rimraf"),
    tmp = require("tmp");

var tileToPngs = require("./lib/tileToPngs");

Promise.promisifyAll(fs);
Promise.promisifyAll(tmp);
rimraf = Promise.promisify(rimraf);

var CELL_HEIGHT = 256,
    CELL_WIDTH = CELL_HEIGHT;

var worker = decider({
  sync: true
}, function(chain, input) {
  return chain
    .then(function() {
      // Keep the directory, we will clean it up manually.
      var tmpOptions = { };
      if (input.tmpDir) { 
        tmpOptions.dir = input.tmpDir; 
      }

      return tmp.dirAsync(tmpOptions);
    })
    .spread(function(tmpDirectory, cleanupCallback) {
      return Promise
        .bind(this)
        .then(function() {
          if(input.images) {
            return input.images;
          };

          return fs.readdirAsync(input.inputDirectory);
        })
        .map(function(file) {
          if(input.reproject) {
            var inputPath = path.join(input.inputDirectory, file),
                outputPath = path.join(tmpDirectory, path.parse(file).name + "-reprojected.tif");

            this.status = util.format("Reprojecting %s to 3857 -> ", inputPath, outputPath);
            return this.activity("reproject", "1.0", inputPath, outputPath, {
              targetSRS: "EPSG:3857",
              overwrite: true,
              nocompression: true
            });
          } else {
            return path.join(input.inputDirectory, file);
          }
        }, { concurrency: os.cpus().length })
        .then(function(images) {
          var options = {
            workingDir : tmpDirectory,
            target: input.outputDirectory,
            tileCols : CELL_WIDTH,
            tileRows : CELL_HEIGHT,
            concurrency: os.cpus().length,
            vrtThreshold : 256
          };

          return tileToPngs.call(this, images, options);
        })
        .finally(function() {
          return rimraf(tmpDirectory);
        });
    })
    .then(function() { 
      return this.complete();
    });
});

worker.start({
  inputDirectory: "/Users/rob/proj/oam/data/faceoff-reproj",
  outputDirectory: "/Users/rob/proj/oam/data/full-tiler-data/sample-tiled",
  tmpDir: "/Users/rob/tmp/oam-tiler", // For placing the working directory somewhere specific
  reproject: true
});

process.on("SIGTERM", function() {
  worker.cancel();
});
