import tracer from 'tracer';

import {setLogger} from '@/lib/util/logger';
import {blockAllProgress} from '@/lib/util/progress';

blockAllProgress(true);
const logLevel = process.env.DEBUG ? 1 : 6;
setLogger(tracer.console({level: logLevel}));
