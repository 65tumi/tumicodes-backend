// models/models.js - Data models and query builders
const { executeQuery } = require('./db');

class UserModel {
    // Create user
    static async create(userData) {
        const { email, name, password, role = 'user', avatar_url = null, bio = null } = userData;
        
        const [result] = await executeQuery(
            `INSERT INTO users (email, name, password, role, avatar_url, bio) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [email, name, password, role, avatar_url, bio]
        );
        
        return result.insertId;
    }
    
    // Find user by email
    static async findByEmail(email) {
        const [users] = await executeQuery(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return users[0];
    }
    
    // Find user by ID
    static async findById(id) {
        const [users] = await executeQuery(
            `SELECT id, email, name, role, avatar_url, bio, xp, level, streak, 
                    last_active, email_verified, created_at, updated_at 
             FROM users WHERE id = ?`,
            [id]
        );
        return users[0];
    }
    
    // Update user
    static async update(id, updates) {
        const fields = Object.keys(updates);
        if (fields.length === 0) return null;
        
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id);
        
        await executeQuery(
            `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return this.findById(id);
    }
    
    // Update last active
    static async updateLastActive(id) {
        await executeQuery(
            'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );
    }
    
    // Get all users with pagination
    static async getAll({ page = 1, limit = 20, search = '', role = '' } = {}) {
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT id, email, name, role, avatar_url, xp, level, streak, 
                   last_active, email_verified, created_at, updated_at
            FROM users
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search) {
            query += ' AND (email LIKE ? OR name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            query += ' AND role = ?';
            params.push(role);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [users] = await executeQuery(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const countParams = [];
        
        if (search) {
            countQuery += ' AND (email LIKE ? OR name LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            countQuery += ' AND role = ?';
            countParams.push(role);
        }
        
        const [countResult] = await executeQuery(countQuery, countParams);
        
        return {
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        };
    }
    
    // Delete user
    static async delete(id) {
        await executeQuery('DELETE FROM users WHERE id = ?', [id]);
    }
}

class CourseModel {
    // Create course
    static async create(courseData) {
        const {
            title, slug, description, short_description, category, difficulty,
            price, discounted_price, thumbnail_url, video_url, duration,
            is_published, is_featured, instructor_id
        } = courseData;
        
        const [result] = await executeQuery(
            `INSERT INTO courses 
             (title, slug, description, short_description, category, difficulty,
              price, discounted_price, thumbnail_url, video_url, duration,
              is_published, is_featured, instructor_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, slug, description, short_description, category, difficulty,
             price, discounted_price, thumbnail_url, video_url, duration,
             is_published ? 1 : 0, is_featured ? 1 : 0, instructor_id]
        );
        
        return result.insertId;
    }
    
    // Find course by ID
    static async findById(id) {
        const [courses] = await executeQuery(
            `SELECT c.*, u.name as instructor_name, u.bio as instructor_bio,
                    u.avatar_url as instructor_avatar
             FROM courses c
             LEFT JOIN users u ON c.instructor_id = u.id
             WHERE c.id = ?`,
            [id]
        );
        return courses[0];
    }
    
    // Find course by slug
    static async findBySlug(slug) {
        const [courses] = await executeQuery(
            `SELECT c.*, u.name as instructor_name, u.bio as instructor_bio,
                    u.avatar_url as instructor_avatar
             FROM courses c
             LEFT JOIN users u ON c.instructor_id = u.id
             WHERE c.slug = ? AND c.is_published = TRUE`,
            [slug]
        );
        return courses[0];
    }
    
    // Get all courses with filters
    static async getAll({ 
        page = 1, 
        limit = 12, 
        category = '', 
        difficulty = '',
        search = '',
        sort = 'popular',
        min_price = 0,
        max_price = 10000,
        is_published = true
    } = {}) {
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT id, title, slug, short_description, category, difficulty,
                   price, discounted_price, thumbnail_url, duration,
                   rating, total_ratings, total_students, is_featured,
                   created_at, updated_at
            FROM courses
            WHERE is_published = ?
        `;
        
        const params = [is_published];
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        if (difficulty) {
            query += ' AND difficulty = ?';
            params.push(difficulty);
        }
        
        if (search) {
            query += ' AND (title LIKE ? OR short_description LIKE ? OR category LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        query += ' AND price BETWEEN ? AND ?';
        params.push(min_price, max_price);
        
        // Sorting
        switch(sort) {
            case 'newest':
                query += ' ORDER BY created_at DESC';
                break;
            case 'price_low':
                query += ' ORDER BY (CASE WHEN discounted_price IS NOT NULL THEN discounted_price ELSE price END) ASC';
                break;
            case 'price_high':
                query += ' ORDER BY (CASE WHEN discounted_price IS NOT NULL THEN discounted_price ELSE price END) DESC';
                break;
            case 'rating':
                query += ' ORDER BY rating DESC';
                break;
            case 'popular':
            default:
                query += ' ORDER BY total_students DESC';
                break;
        }
        
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [courses] = await executeQuery(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM courses WHERE is_published = ?';
        const countParams = [is_published];
        
        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }
        
        if (difficulty) {
            countQuery += ' AND difficulty = ?';
            countParams.push(difficulty);
        }
        
        if (search) {
            countQuery += ' AND (title LIKE ? OR short_description LIKE ? OR category LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        countQuery += ' AND price BETWEEN ? AND ?';
        countParams.push(min_price, max_price);
        
        const [countResult] = await executeQuery(countQuery, countParams);
        
        return {
            data: courses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        };
    }
    
    // Update course
    static async update(id, updates) {
        const fields = Object.keys(updates);
        if (fields.length === 0) return null;
        
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id);
        
        await executeQuery(
            `UPDATE courses SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return this.findById(id);
    }
    
    // Delete course
    static async delete(id) {
        await executeQuery('DELETE FROM courses WHERE id = ?', [id]);
    }
    
    // Enroll user in course
    static async enrollUser(userId, courseId) {
        const [result] = await executeQuery(
            `INSERT INTO user_courses (user_id, course_id, started_at) 
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [userId, courseId]
        );
        return result.insertId;
    }
    
    // Check if user is enrolled
    static async isUserEnrolled(userId, courseId) {
        const [enrollments] = await executeQuery(
            'SELECT id FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        return enrollments.length > 0;
    }
    
    // Get user course progress
    static async getUserProgress(userId, courseId) {
        const [progress] = await executeQuery(
            'SELECT * FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        return progress[0];
    }
    
    // Update user progress
    static async updateUserProgress(userId, courseId, progress, lessonId = null) {
        await executeQuery(
            `UPDATE user_courses 
             SET progress = ?, current_lesson_id = ?, last_accessed = CURRENT_TIMESTAMP
             WHERE user_id = ? AND course_id = ?`,
            [progress, lessonId, userId, courseId]
        );
    }
    
    // Mark course as completed
    static async markAsCompleted(enrollmentId, courseTitle) {
        await executeQuery(
            `UPDATE user_courses 
             SET completed = TRUE, completed_at = CURRENT_TIMESTAMP, progress = 100
             WHERE id = ?`,
            [enrollmentId]
        );
    }
    
    // Get user courses
    static async getUserCourses(userId, status = 'all') {
        let query = `
            SELECT c.id, c.title, c.slug, c.description, c.short_description, c.category, 
                   c.difficulty, c.thumbnail_url, c.duration, c.rating, c.total_ratings,
                   uc.progress, uc.completed, uc.started_at, uc.completed_at, uc.last_accessed,
                   uc.rating as user_rating, uc.review as user_review
            FROM user_courses uc
            JOIN courses c ON uc.course_id = c.id
            WHERE uc.user_id = ? AND c.is_published = TRUE
        `;
        
        const params = [userId];
        
        if (status === 'active') {
            query += ' AND uc.completed = FALSE';
        } else if (status === 'completed') {
            query += ' AND uc.completed = TRUE';
        }
        
        query += ' ORDER BY uc.last_accessed DESC';
        
        const [courses] = await executeQuery(query, params);
        return courses;
    }
}

class CertificateModel {
    // Create certificate
    static async create(certificateData) {
        const {
            user_id, course_id, certificate_id, full_name, 
            course_title, verification_url
        } = certificateData;
        
        const [result] = await executeQuery(
            `INSERT INTO certificates 
             (user_id, course_id, certificate_id, full_name, course_title, verification_url)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, course_id, certificate_id, full_name, course_title, verification_url]
        );
        
        return result.insertId;
    }
    
    // Find certificate by ID
    static async findById(id) {
        const [certificates] = await executeQuery(
            `SELECT c.*, cr.title as course_title_full, cr.slug as course_slug
             FROM certificates c
             LEFT JOIN courses cr ON c.course_id = cr.id
             WHERE c.id = ?`,
            [id]
        );
        return certificates[0];
    }
    
    // Find certificate by certificate ID
    static async findByCertificateId(certificateId) {
        const [certificates] = await executeQuery(
            `SELECT c.*, cr.title as course_title_full, cr.slug as course_slug,
                    u.name as user_name, u.email as user_email
             FROM certificates c
             LEFT JOIN courses cr ON c.course_id = cr.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.certificate_id = ?`,
            [certificateId]
        );
        return certificates[0];
    }
    
    // Get user certificates
    static async getUserCertificates(userId) {
        const [certificates] = await executeQuery(
            `SELECT c.id, c.certificate_id, c.full_name, c.course_title, 
                    c.issue_date, c.expiry_date, c.download_url, c.verification_url,
                    c.is_verified, c.created_at,
                    cr.title as course_title_full, cr.slug as course_slug
             FROM certificates c
             LEFT JOIN courses cr ON c.course_id = cr.id
             WHERE c.user_id = ?
             ORDER BY c.issue_date DESC`,
            [userId]
        );
        return certificates;
    }
    
    // Verify certificate
    static async verify(certificateId) {
        await executeQuery(
            'UPDATE certificates SET is_verified = TRUE WHERE certificate_id = ?',
            [certificateId]
        );
    }
}

class ProjectModel {
    // Create project
    static async create(projectData) {
        const {
            user_id, title, slug, description, thumbnail_url,
            github_url, live_url, tags, status, progress, is_public
        } = projectData;
        
        const [result] = await executeQuery(
            `INSERT INTO projects 
             (user_id, title, slug, description, thumbnail_url, github_url, 
              live_url, tags, status, progress, is_public)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, title, slug, description, thumbnail_url, github_url,
             live_url, JSON.stringify(tags || []), status, progress, is_public]
        );
        
        return result.insertId;
    }
    
    // Find project by ID
    static async findById(id) {
        const [projects] = await executeQuery(
            `SELECT id, title, slug, description, thumbnail_url, github_url, live_url, 
                    tags, status, progress, is_public, views_count, likes_count,
                    collaborators, started_at, completed_at, created_at, updated_at
             FROM projects WHERE id = ?`,
            [id]
        );
        
        if (projects.length === 0) return null;
        
        const project = projects[0];
        return {
            ...project,
            tags: project.tags ? JSON.parse(project.tags) : [],
            collaborators: project.collaborators ? JSON.parse(project.collaborators) : []
        };
    }
    
    // Find project by slug
    static async findBySlug(slug) {
        const [projects] = await executeQuery(
            `SELECT p.*, u.name as user_name, u.avatar_url as user_avatar
             FROM projects p
             JOIN users u ON p.user_id = u.id
             WHERE p.slug = ?`,
            [slug]
        );
        
        if (projects.length === 0) return null;
        
        const project = projects[0];
        return {
            ...project,
            tags: project.tags ? JSON.parse(project.tags) : [],
            collaborators: project.collaborators ? JSON.parse(project.collaborators) : []
        };
    }
    
    // Get user projects
    static async getUserProjects(userId, { status = 'all', limit = 20, offset = 0 } = {}) {
        let query = `
            SELECT id, title, slug, description, thumbnail_url, github_url, live_url, 
                   tags, status, progress, is_public, views_count, likes_count,
                   collaborators, started_at, completed_at, created_at, updated_at
            FROM projects
            WHERE user_id = ?
        `;
        
        const params = [userId];
        
        if (status !== 'all') {
            query += ' AND status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [projects] = await executeQuery(query, params);
        
        // Parse JSON fields
        const parsedProjects = projects.map(project => ({
            ...project,
            tags: project.tags ? JSON.parse(project.tags) : [],
            collaborators: project.collaborators ? JSON.parse(project.collaborators) : []
        }));
        
        return parsedProjects;
    }
    
    // Update project
    static async update(id, updates) {
        const fields = Object.keys(updates);
        if (fields.length === 0) return null;
        
        // Handle JSON fields
        const processedUpdates = { ...updates };
        if (updates.tags) {
            processedUpdates.tags = JSON.stringify(updates.tags);
        }
        if (updates.collaborators) {
            processedUpdates.collaborators = JSON.stringify(updates.collaborators);
        }
        
        const setClause = Object.keys(processedUpdates)
            .map(field => `${field} = ?`)
            .join(', ');
        
        const values = Object.keys(processedUpdates)
            .map(field => processedUpdates[field]);
        values.push(id);
        
        await executeQuery(
            `UPDATE projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return this.findById(id);
    }
    
    // Delete project
    static async delete(id) {
        await executeQuery('DELETE FROM projects WHERE id = ?', [id]);
    }
}

class NotificationModel {
    // Create notification
    static async create(notificationData) {
        const { user_id, type, title, message, icon, data } = notificationData;
        
        const [result] = await executeQuery(
            `INSERT INTO notifications (user_id, type, title, message, icon, data)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, type, title, message, icon, JSON.stringify(data || {})]
        );
        
        return result.insertId;
    }
    
    // Create multiple notifications
    static async createMultiple(notifications) {
        if (notifications.length === 0) return;
        
        const values = notifications.map(notif => [
            notif.user_id,
            notif.type,
            notif.title,
            notif.message,
            notif.icon,
            JSON.stringify(notif.data || {})
        ]);
        
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon, data) VALUES ?',
            [values]
        );
    }
    
    // Get user notifications
    static async getUserNotifications(userId, { limit = 50, offset = 0, unread_only = false } = {}) {
        let query = `
            SELECT id, type, title, message, icon, data, is_read, created_at, read_at
            FROM notifications
            WHERE user_id = ?
        `;
        
        const params = [userId];
        
        if (unread_only) {
            query += ' AND is_read = FALSE';
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [notifications] = await executeQuery(query, params);
        
        // Parse JSON data
        const parsedNotifications = notifications.map(notif => ({
            ...notif,
            data: notif.data ? JSON.parse(notif.data) : {}
        }));
        
        return parsedNotifications;
    }
    
    // Mark as read
    static async markAsRead(id, userId) {
        await executeQuery(
            'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [id, userId]
        );
    }
    
    // Mark all as read
    static async markAllAsRead(userId) {
        await executeQuery(
            'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
    }
    
    // Get unread count
    static async getUnreadCount(userId) {
        const [result] = await executeQuery(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        return result[0].count;
    }
}

class ActivityModel {
    // Create activity
    static async create(activityData) {
        const { user_id, type, title, description, reference_id, reference_type, metadata } = activityData;
        
        const [result] = await executeQuery(
            `INSERT INTO activities (user_id, type, title, description, reference_id, reference_type, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, type, title, description, reference_id, reference_type, JSON.stringify(metadata || {})]
        );
        
        return result.insertId;
    }
    
    // Get user activities
    static async getUserActivities(userId, { limit = 20, offset = 0 } = {}) {
        const [activities] = await executeQuery(
            `SELECT id, type, title, description, reference_id, reference_type, metadata, created_at
             FROM activities
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), parseInt(offset)]
        );
        
        // Parse JSON metadata
        const parsedActivities = activities.map(activity => ({
            ...activity,
            metadata: activity.metadata ? JSON.parse(activity.metadata) : {}
        }));
        
        return parsedActivities;
    }
}

class PaymentModel {
    // Create payment
    static async create(paymentData) {
        const {
            user_id, course_id, amount, currency, status,
            payment_method, payment_gateway, transaction_id, gateway_response, metadata
        } = paymentData;
        
        const [result] = await executeQuery(
            `INSERT INTO payments 
             (user_id, course_id, amount, currency, status, payment_method, 
              payment_gateway, transaction_id, gateway_response, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, course_id, amount, currency, status, payment_method,
             payment_gateway, transaction_id, JSON.stringify(gateway_response || {}),
             JSON.stringify(metadata || {})]
        );
        
        return result.insertId;
    }
    
    // Find payment by ID
    static async findById(id) {
        const [payments] = await executeQuery(
            `SELECT p.*, u.email as user_email, u.name as user_name,
                    c.title as course_title, c.slug as course_slug
             FROM payments p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN courses c ON p.course_id = c.id
             WHERE p.id = ?`,
            [id]
        );
        
        if (payments.length === 0) return null;
        
        const payment = payments[0];
        return {
            ...payment,
            gateway_response: payment.gateway_response ? JSON.parse(payment.gateway_response) : {},
            metadata: payment.metadata ? JSON.parse(payment.metadata) : {}
        };
    }
    
    // Find payment by transaction ID
    static async findByTransactionId(transactionId) {
        const [payments] = await executeQuery(
            `SELECT p.*, u.email as user_email, u.name as user_name,
                    c.title as course_title, c.slug as course_slug
             FROM payments p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN courses c ON p.course_id = c.id
             WHERE p.transaction_id = ?`,
            [transactionId]
        );
        
        if (payments.length === 0) return null;
        
        const payment = payments[0];
        return {
            ...payment,
            gateway_response: payment.gateway_response ? JSON.parse(payment.gateway_response) : {},
            metadata: payment.metadata ? JSON.parse(payment.metadata) : {}
        };
    }
    
    // Update payment status
    static async updateStatus(id, status, gatewayResponse = null) {
        const updates = { status };
        if (gatewayResponse) {
            updates.gateway_response = JSON.stringify(gatewayResponse);
        }
        
        const fields = Object.keys(updates);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id);
        
        await executeQuery(
            `UPDATE payments SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        
        return this.findById(id);
    }
    
    // Get user payments
    static async getUserPayments(userId, { limit = 20, offset = 0 } = {}) {
        const [payments] = await executeQuery(
            `SELECT p.*, c.title as course_title, c.slug as course_slug
             FROM payments p
             LEFT JOIN courses c ON p.course_id = c.id
             WHERE p.user_id = ?
             ORDER BY p.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), parseInt(offset)]
        );
        
        // Parse JSON fields
        const parsedPayments = payments.map(payment => ({
            ...payment,
            gateway_response: payment.gateway_response ? JSON.parse(payment.gateway_response) : {},
            metadata: payment.metadata ? JSON.parse(payment.metadata) : {}
        }));
        
        return parsedPayments;
    }
    
    // Get all payments with filters
    static async getAll({ 
        page = 1, 
        limit = 20, 
        status = '', 
        start_date = '', 
        end_date = '' 
    } = {}) {
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT p.*, u.email as user_email, u.name as user_name,
                   c.title as course_title, c.slug as course_slug
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN courses c ON p.course_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }
        
        if (start_date) {
            query += ' AND p.created_at >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND p.created_at <= ?';
            params.push(end_date + ' 23:59:59');
        }
        
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [payments] = await executeQuery(query, params);
        
        // Parse JSON fields
        const parsedPayments = payments.map(payment => ({
            ...payment,
            gateway_response: payment.gateway_response ? JSON.parse(payment.gateway_response) : {},
            metadata: payment.metadata ? JSON.parse(payment.metadata) : {}
        }));
        
        // Get total count and revenue
        let statsQuery = 'SELECT COUNT(*) as total, SUM(amount) as revenue FROM payments WHERE 1=1';
        const statsParams = [];
        
        if (status) {
            statsQuery += ' AND status = ?';
            statsParams.push(status);
        }
        
        if (start_date) {
            statsQuery += ' AND created_at >= ?';
            statsParams.push(start_date);
        }
        
        if (end_date) {
            statsQuery += ' AND created_at <= ?';
            statsParams.push(end_date + ' 23:59:59');
        }
        
        const [stats] = await executeQuery(statsQuery, statsParams);
        
        return {
            data: parsedPayments,
            stats: {
                total: stats[0].total,
                revenue: stats[0].revenue || 0
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: stats[0].total,
                pages: Math.ceil(stats[0].total / limit)
            }
        };
    }
}

class SkillModel {
    // Create or update skill
    static async upsert(skillData) {
        const { user_id, skill_name, skill_level, experience_years = 0 } = skillData;
        
        // Check if skill exists
        const [existing] = await executeQuery(
            'SELECT id FROM user_skills WHERE user_id = ? AND skill_name = ?',
            [user_id, skill_name]
        );
        
        if (existing.length > 0) {
            // Update existing
            await executeQuery(
                `UPDATE user_skills 
                 SET skill_level = ?, experience_years = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [skill_level, experience_years, existing[0].id]
            );
            
            const [skills] = await executeQuery(
                'SELECT * FROM user_skills WHERE id = ?',
                [existing[0].id]
            );
            return skills[0];
        } else {
            // Insert new
            const [result] = await executeQuery(
                `INSERT INTO user_skills (user_id, skill_name, skill_level, experience_years)
                 VALUES (?, ?, ?, ?)`,
                [user_id, skill_name, skill_level, experience_years]
            );
            
            const [skills] = await executeQuery(
                'SELECT * FROM user_skills WHERE id = ?',
                [result.insertId]
            );
            return skills[0];
        }
    }
    
    // Get user skills
    static async getUserSkills(userId) {
        const [skills] = await executeQuery(
            `SELECT id, skill_name, skill_level, experience_years, projects_count, 
                    is_verified, verified_at, created_at, updated_at
             FROM user_skills
             WHERE user_id = ?
             ORDER BY skill_level DESC, created_at DESC`,
            [userId]
        );
        return skills;
    }
    
    // Delete skill
    static async delete(id, userId) {
        await executeQuery(
            'DELETE FROM user_skills WHERE id = ? AND user_id = ?',
            [id, userId]
        );
    }
}

class AchievementModel {
    // Create achievement
    static async create(achievementData) {
        const { user_id, name, description, icon, points = 0, category } = achievementData;
        
        const [result] = await executeQuery(
            `INSERT INTO achievements (user_id, name, description, icon, points, category)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, name, description, icon, points, category]
        );
        
        return result.insertId;
    }
    
    // Get user achievements
    static async getUserAchievements(userId) {
        const [achievements] = await executeQuery(
            `SELECT id, name, description, icon, points, category, earned_at
             FROM achievements
             WHERE user_id = ?
             ORDER BY earned_at DESC`,
            [userId]
        );
        return achievements;
    }
    
    // Check if user has achievement
    static async hasAchievement(userId, name) {
        const [achievements] = await executeQuery(
            'SELECT id FROM achievements WHERE user_id = ? AND name = ?',
            [userId, name]
        );
        return achievements.length > 0;
    }
}

// Statistics functions
class StatsModel {
    // Get user statistics
    static async getUserStats(userId) {
        const [
            [coursesCount],
            [activeCoursesCount],
            [completedCoursesCount],
            [projectsCount],
            [certificatesCount],
            [achievementsCount]
        ] = await Promise.all([
            executeQuery('SELECT COUNT(*) as count FROM user_courses WHERE user_id = ?', [userId]),
            executeQuery('SELECT COUNT(*) as count FROM user_courses WHERE user_id = ? AND completed = FALSE', [userId]),
            executeQuery('SELECT COUNT(*) as count FROM user_courses WHERE user_id = ? AND completed = TRUE', [userId]),
            executeQuery('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [userId]),
            executeQuery('SELECT COUNT(*) as count FROM certificates WHERE user_id = ?', [userId]),
            executeQuery('SELECT COUNT(*) as count FROM achievements WHERE user_id = ?', [userId])
        ]);
        
        // Get user XP and level
        const [user] = await executeQuery(
            'SELECT xp, level, streak FROM users WHERE id = ?',
            [userId]
        );
        
        return {
            courses: {
                total: coursesCount[0].count,
                active: activeCoursesCount[0].count,
                completed: completedCoursesCount[0].count
            },
            projects: projectsCount[0].count,
            certificates: certificatesCount[0].count,
            achievements: achievementsCount[0].count,
            xp: user[0].xp || 0,
            level: user[0].level || 1,
            streak: user[0].streak || 0
        };
    }
    
    // Get system statistics
    static async getSystemStats() {
        const [
            [totalUsers],
            [activeUsers],
            [adminUsers],
            [totalCourses],
            [publishedCourses],
            [totalEnrollments],
            [completedCourses],
            [totalCertificates],
            [totalProjects],
            [totalPayments],
            [revenue]
        ] = await Promise.all([
            executeQuery('SELECT COUNT(*) as count FROM users'),
            executeQuery('SELECT COUNT(*) as count FROM users WHERE last_active >= DATE_SUB(NOW(), INTERVAL 7 DAY)'),
            executeQuery('SELECT COUNT(*) as count FROM users WHERE role = "admin"'),
            executeQuery('SELECT COUNT(*) as count FROM courses'),
            executeQuery('SELECT COUNT(*) as count FROM courses WHERE is_published = TRUE'),
            executeQuery('SELECT COUNT(*) as count FROM user_courses'),
            executeQuery('SELECT COUNT(*) as count FROM user_courses WHERE completed = TRUE'),
            executeQuery('SELECT COUNT(*) as count FROM certificates'),
            executeQuery('SELECT COUNT(*) as count FROM projects'),
            executeQuery('SELECT COUNT(*) as count FROM payments WHERE status = "completed"'),
            executeQuery('SELECT SUM(amount) as total FROM payments WHERE status = "completed"')
        ]);
        
        // Get recent users
        const [recentUsers] = await executeQuery(
            `SELECT id, email, name, role, created_at 
             FROM users 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             ORDER BY created_at DESC 
             LIMIT 10`
        );
        
        // Get popular courses
        const [popularCourses] = await executeQuery(
            `SELECT c.id, c.title, c.slug, c.total_students, c.rating, 
                    COUNT(uc.id) as recent_enrollments
             FROM courses c
             LEFT JOIN user_courses uc ON c.id = uc.course_id AND uc.started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             WHERE c.is_published = TRUE
             GROUP BY c.id
             ORDER BY c.total_students DESC
             LIMIT 10`
        );
        
        // Get daily registrations
        const [dailyRegistrations] = await executeQuery(
            `SELECT DATE(created_at) as date, COUNT(*) as count
             FROM users
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at)
             ORDER BY date`
        );
        
        return {
            users: {
                total: totalUsers[0].count,
                active: activeUsers[0].count,
                admins: adminUsers[0].count,
                recent: recentUsers
            },
            courses: {
                total: totalCourses[0].count,
                published: publishedCourses[0].count,
                enrollments: totalEnrollments[0].count,
                completed: completedCourses[0].count,
                popular: popularCourses
            },
            certificates: totalCertificates[0].count,
            projects: totalProjects[0].count,
            payments: {
                total: totalPayments[0].count,
                revenue: revenue[0].total || 0
            },
            analytics: {
                daily_registrations: dailyRegistrations
            }
        };
    }
}

module.exports = {
    UserModel,
    CourseModel,
    CertificateModel,
    ProjectModel,
    NotificationModel,
    ActivityModel,
    PaymentModel,
    SkillModel,
    AchievementModel,
    StatsModel
};