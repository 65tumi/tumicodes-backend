/**
 * Input validation utilities
 */

const validator = require('validator');

class Validators {
    // Email validation
    static isValidEmail(email) {
        return validator.isEmail(email);
    }

    // Password validation
    static isValidPassword(password) {
        if (!password || password.length < 6) {
            return {
                valid: false,
                message: 'Password must be at least 6 characters'
            };
        }
        return { valid: true };
    }

    // Phone number validation
    static isValidPhone(phone) {
        return validator.isMobilePhone(phone, 'any', { strictMode: false });
    }

    // URL validation
    static isValidURL(url) {
        return validator.isURL(url, {
            protocols: ['http', 'https'],
            require_protocol: true
        });
    }

    // Check if string is empty
    static isNotEmpty(str) {
        return str && typeof str === 'string' && str.trim().length > 0;
    }

    // Check if it's a valid number
    static isNumber(value) {
        return !isNaN(parseFloat(value)) && isFinite(value);
    }

    // Check if value is within range
    static isInRange(value, min, max) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= min && num <= max;
    }

    // Validate user registration data
    static validateUserRegistration(data) {
        const errors = [];
        
        if (!this.isNotEmpty(data.name)) {
            errors.push('Name is required');
        }
        
        if (!this.isValidEmail(data.email)) {
            errors.push('Valid email is required');
        }
        
        const passwordValidation = this.isValidPassword(data.password);
        if (!passwordValidation.valid) {
            errors.push(passwordValidation.message);
        }
        
        if (data.password !== data.confirmPassword) {
            errors.push('Passwords do not match');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Validate course data
    static validateCourse(data) {
        const errors = [];
        
        if (!this.isNotEmpty(data.title)) {
            errors.push('Course title is required');
        }
        
        if (!this.isNotEmpty(data.description)) {
            errors.push('Course description is required');
        }
        
        if (data.price !== undefined && !this.isNumber(data.price)) {
            errors.push('Price must be a valid number');
        }
        
        if (data.price !== undefined && data.price < 0) {
            errors.push('Price cannot be negative');
        }
        
        if (data.duration && !this.isNumber(data.duration)) {
            errors.push('Duration must be a valid number');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Validate payment data
    static validatePayment(data) {
        const errors = [];
        
        if (!data.user_id || !this.isNumber(data.user_id)) {
            errors.push('Valid user ID is required');
        }
        
        if (!data.amount || !this.isNumber(data.amount)) {
            errors.push('Valid amount is required');
        }
        
        if (data.amount <= 0) {
            errors.push('Amount must be greater than 0');
        }
        
        if (!this.isNotEmpty(data.payment_method)) {
            errors.push('Payment method is required');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Sanitize input
    static sanitizeInput(input) {
        if (typeof input === 'string') {
            return validator.escape(input.trim());
        }
        return input;
    }

    // Validate file type
    static isValidFileType(filename, allowedTypes = ['jpg', 'jpeg', 'png', 'gif', 'pdf']) {
        const extension = filename.split('.').pop().toLowerCase();
        return allowedTypes.includes(extension);
    }

    // Validate file size
    static isValidFileSize(fileSize, maxSizeMB = 5) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return fileSize <= maxSizeBytes;
    }

    // Validate date
    static isValidDate(dateString) {
        return validator.isDate(dateString);
    }

    // Validate array
    static isValidArray(arr, minLength = 0) {
        return Array.isArray(arr) && arr.length >= minLength;
    }

    // Validate object
    static isValidObject(obj) {
        return obj && typeof obj === 'object' && !Array.isArray(obj);
    }

    // Validate rating (1-5)
    static isValidRating(rating) {
        return this.isNumber(rating) && rating >= 1 && rating <= 5;
    }

    // Validate progress percentage (0-100)
    static isValidProgress(progress) {
        return this.isNumber(progress) && progress >= 0 && progress <= 100;
    }
}

module.exports = Validators;