/**
 * General helper functions
 */

const crypto = require('crypto');

class Helpers {
    // Generate random string
    static generateRandomString(length = 10) {
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    }

    // Generate unique ID
    static generateUniqueId(prefix = '') {
        return `${prefix}${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    }

    // Generate slug from string
    static generateSlug(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special chars
            .replace(/\s+/g, '-')     // Replace spaces with hyphens
            .replace(/--+/g, '-')     // Replace multiple hyphens with single
            .trim();
    }

    // Format currency
    static formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // Truncate text with ellipsis
    static truncateText(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength - 3) + '...';
    }

    // Convert object to query string
    static objectToQueryString(obj) {
        return Object.keys(obj)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
            .join('&');
    }

    // Deep clone object (simple version)
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // Check if object is empty
    static isEmptyObject(obj) {
        return Object.keys(obj).length === 0;
    }

    // Get file extension
    static getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
    }

    // Generate file hash
    static generateFileHash(buffer) {
        return crypto.createHash('md5').update(buffer).digest('hex');
    }

    // Sleep/delay function
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Validate JSON
    static isValidJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch {
            return false;
        }
    }

    // Mask sensitive data (like email, phone)
    static maskSensitiveData(text, type = 'email') {
        if (type === 'email') {
            const [local, domain] = text.split('@');
            const maskedLocal = local.length > 2 ? 
                local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] : 
                '*'.repeat(local.length);
            return `${maskedLocal}@${domain}`;
        }
        
        if (type === 'phone') {
            return text.replace(/\d(?=\d{4})/g, '*');
        }
        
        return text;
    }

    // Calculate percentage
    static calculatePercentage(part, total) {
        if (total === 0) return 0;
        return Math.round((part / total) * 100);
    }

    // Get current timestamp in seconds
    static getTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    // Generate order number
    static generateOrderNumber() {
        const date = new Date();
        const year = date.getFullYear().toString().substr(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        
        return `ORD${year}${month}${day}${random}`;
    }
}

module.exports = Helpers;