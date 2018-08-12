const tracer = require('tracer');

const logger = require('@/lib/util/logger');
const progress = require('@/lib/util/progress');

progress.blockAllProgress(true);
logger.setLogger(tracer.console({level: 6}));
