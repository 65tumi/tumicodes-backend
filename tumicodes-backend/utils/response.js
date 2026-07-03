/**
 * Standard API response format
 */

class Response {
    // Success response
    static success(data, message = 'Success', statusCode = 200) {
        return {
            success: true,
            message: message,
            data: data,
            timestamp: new Date().toISOString()
        };
    }

    // Error response
    static error(message, errors = null, statusCode = 400) {
        return {
            success: false,
            message: message,
            errors: errors,
            timestamp: new Date().toISOString()
        };
    }

    // Pagination response
    static pagination(data, page, limit, total) {
        return {
            success: true,
            data: data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            },
            timestamp: new Date().toISOString()
        };
    }

    // Created response
    static created(data, message = 'Resource created successfully') {
        return this.success(data, message, 201);
    }

    // Updated response
    static updated(data, message = 'Resource updated successfully') {
        return this.success(data, message, 200);
    }

    // Deleted response
    static deleted(message = 'Resource deleted successfully') {
        return this.success(null, message, 200);
    }

    // Not found response
    static notFound(resource = 'Resource') {
        return this.error(`${resource} not found`, null, 404);
    }

    // Unauthorized response
    static unauthorized(message = 'Unauthorized access') {
        return this.error(message, null, 401);
    }

    // Forbidden response
    static forbidden(message = 'Access forbidden') {
        return this.error(message, null, 403);
    }

    // Validation error response
    static validationError(errors, message = 'Validation failed') {
        return this.error(message, errors, 422);
    }

    // Server error response
    static serverError(message = 'Internal server error') {
        return this.error(message, null, 500);
    }

    // Send response
    static send(res, data, statusCode = 200) {
        return res.status(statusCode).json(data);
    }
}

module.exports = Response;