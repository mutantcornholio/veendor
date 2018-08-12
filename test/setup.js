const tracer = require('tracer');

const logger = require('@/lib/util/logger');
const progress = require('@/lib/util/progress');

progress.blockAllProgress(true);
const logLevel = process.env.DEBUG ? 1 : 6;
logger.setLogger(tracer.console({level: logLevel}));
