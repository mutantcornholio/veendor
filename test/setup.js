const logger = require('@/lib/logger');
const tracer = require('tracer');
logger.setLogger(tracer.console({level: 6}));
