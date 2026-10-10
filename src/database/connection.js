import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initializeGroups } from '../groups/schema.js';
import { initializeSchema } from './migrations.js';
import { seedDemoFixtures } from './demo-fixtures.js';

const path = process.env.DATABASE_PATH || './data/calendar.sqlite';
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
initializeSchema(db);
initializeGroups(db);
seedDemoFixtures(db);
