import { anyApi, cronJobs } from 'convex/server';

const crons = cronJobs();

crons.interval('purge expired tutor cache entries', { minutes: 15 }, anyApi.memory.purgeExpiredCache);

export default crons;
