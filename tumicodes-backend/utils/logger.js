/**
 * Custom logging utility
 */

const fs = require('fs');
const path = require('path');

class Logger {
    static levels = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };

    static currentLevel = process.env.NODE_ENV === 'production' ? 
        this.levels.INFO : this.levels.DEBUG;

    static logDir = path.join(__dirname, '../logs');

    // Create logs directory if it doesn't exist
    static init() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    // Log to file
    static writeToFile(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
        
        let logEntry = `[${timestamp}] [${level}] ${message}`;
        if (data) {
            logEntry += `\n${JSON.stringify(data, null, 2)}`;
        }
        logEntry += '\n---\n';

        fs.appendFile(logFile, logEntry, (err) => {
            if (err) console.error('Failed to write to log file:', err);
        });
    }

    // Error log
    static error(message, error = null) {
        if (this.currentLevel >= this.levels.ERROR) {
            console.error(`❌ ERROR: ${message}`, error || '');
            this.writeToFile('ERROR', message, error);
        }
    }

    // Warning log
    static warn(message, data = null) {
        if (this.currentLevel >= this.levels.WARN) {
            console.warn(`⚠️  WARN: ${message}`);
            this.writeToFile('WARN', message, data);
        }
    }

    // Info log
    static info(message, data = null) {
        if (this.currentLevel >= this.levels.INFO) {
            console.info(`ℹ️  INFO: ${message}`);
            this.writeToFile('INFO', message, data);
        }
    }

    // Debug log
    static debug(message, data = null) {
        if (this.currentLevel >= this.levels.DEBUG) {
            console.debug(`🔍 DEBUG: ${message}`, data || '');
            this.writeToFile('DEBUG', message, data);
        }
    }

    // API request log
    static apiRequest(req, res, next) {
        const start = Date.now();
        const originalSend = res.send;
        
        res.send = function(data) {
            const duration = Date.now() - start;
            const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
            
            if (res.statusCode >= 400) {
                Logger.error(logMessage, {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    body: req.body,
                    params: req.params,
                    query: req.query
                });
            } else {
                Logger.info(logMessage);
            }
            
            originalSend.call(this, data);
        };
        
        next();
    }

    // Database query log
    static dbQuery(query, params, duration) {
        if (this.currentLevel >= this.levels.DEBUG) {
            Logger.debug(`DB Query: ${query}`, {
                params,
                duration: `${duration}ms`
            });
        }
    }
}

// Initialize logger
Logger.init();

module.exports = Logger;