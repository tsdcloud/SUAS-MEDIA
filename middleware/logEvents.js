// Import necessary modules using ES6 import syntax
import { format } from 'date-fns';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// For handling __dirname in ES6
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Asynchronous function to log events
export const logEvents = async (message, logName) => {
    const dateTime = `${format(new Date(), 'yyyyMMdd\tHH:mm:ss')}`;
    const logItem = `${dateTime}\t${uuid()}\t${message}\n`;

    try {
        const logDir = path.join(__dirname, '..', 'logs');
        
        // Check if the 'logs' directory exists, if not, create it
        if (!fs.existsSync(logDir)) {
            await fsPromises.mkdir(logDir);
        }

        // Append the log item to the specified log file
        await fsPromises.appendFile(path.join(logDir, logName), logItem);
    } catch (err) {
        console.log(err);
    }
}

// Logger middleware function for Express
export const logger = (req, res, next) => {
    logEvents(`${req.method}\t${req.headers.origin}\t${req.url}`, 'logs.txt');
    console.log(`${req.method}\t${req.url}\t${req.headers.origin}\t${req.body}`);
    next();
}
