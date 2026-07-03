// controllers/adminController.js
const bcrypt = require('bcryptjs');
const { executeQuery } = require('../models/db');
const {
    UserModel,
    CourseModel,
    ProjectModel,
    CertificateModel,
    NotificationModel,
    PaymentModel,
    StatsModel,
    ActivityModel,
    SkillModel,
    AchievementModel
} = require('../models/models');

class AdminController {
    
    // 1. USER MANAGEMENT
    
    // Get all users with search and filters
    static async getUsers(req, res) {
        try {
            const { page = 1, limit = 20, search = '', role = '' } = req.query;
            const offset = (page - 1) * limit;
            
            let query = `SELECT * FROM users WHERE 1=1`;
            const params = [];
            
            if (search) {
                query += ' AND (email LIKE ? OR name LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }
            
            if (role) {
                query += ' AND role = ?';
                params.push(role);
            }
            
            query += ` LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
            
            const [users] = await executeQuery(query, params);
            
            // Get total count
            const [countResult] = await executeQuery(
                'SELECT COUNT(*) as total FROM users WHERE 1=1',
                params.slice(0, -2) // Remove limit and offset for count
            );
            
            res.json({
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get users' });
        }
    }
    
    // Get details of one user
    static async getUserDetails(req, res) {
        try {
            const userId = req.params.id;
            
            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Get user's courses
            const [courses] = await executeQuery(
                'SELECT * FROM user_courses WHERE user_id = ?',
                [userId]
            );
            
            // Get user's projects
            const [projects] = await executeQuery(
                'SELECT * FROM projects WHERE user_id = ?',
                [userId]
            );
            
            res.json({
                user,
                courses,
                projects
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get user details' });
        }
    }
    
    // Create new user (admin only)
    static async createUser(req, res) {
        try {
            const { email, name, password, role = 'user' } = req.body;
            
            // Check required fields
            if (!email || !password || !name) {
                return res.status(400).json({ error: 'Email, password, and name are required' });
            }
            
            // Check if user already exists
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ error: 'User already exists' });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);
            
            // Create user
            const userId = await UserModel.create({
                email,
                name,
                password: hashedPassword,
                role
            });
            
            const user = await UserModel.findById(userId);
            
            res.status(201).json({
                message: 'User created successfully',
                user
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
    
    // Update user information
    static async updateUser(req, res) {
        try {
            const userId = req.params.id;
            const updates = req.body;
            
            // Check if user exists
            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Hash password if updating
            if (updates.password) {
                updates.password = await bcrypt.hash(updates.password, 12);
            }
            
            // Update user
            const updatedUser = await UserModel.update(userId, updates);
            
            res.json({
                message: 'User updated successfully',
                user: updatedUser
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update user' });
        }
    }
    
    // Delete user
    static async deleteUser(req, res) {
        try {
            const userId = req.params.id;
            
            // Check if user exists
            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Don't allow deleting yourself
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ error: 'Cannot delete your own account' });
            }
            
            // Delete user
            await UserModel.delete(userId);
            
            res.json({
                message: 'User deleted successfully',
                deleted_user: {
                    id: user.id,
                    email: user.email
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete user' });
        }
    }
    
    // 2. COURSE MANAGEMENT
    
    // Get all courses
    static async getCourses(req, res) {
        try {
            const { page = 1, limit = 20, search = '' } = req.query;
            const offset = (page - 1) * limit;
            
            let query = `SELECT * FROM courses WHERE 1=1`;
            const params = [];
            
            if (search) {
                query += ' AND (title LIKE ? OR description LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }
            
            query += ` LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
            
            const [courses] = await executeQuery(query, params);
            
            // Get total count
            const [countResult] = await executeQuery(
                'SELECT COUNT(*) as total FROM courses WHERE 1=1',
                params.slice(0, -2)
            );
            
            res.json({
                courses,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get courses' });
        }
    }
    
    // Create new course
    static async createCourse(req, res) {
        try {
            const { title, description, category, difficulty, price } = req.body;
            
            // Check required fields
            if (!title || !description) {
                return res.status(400).json({ error: 'Title and description are required' });
            }
            
            // Create course
            const courseId = await CourseModel.create({
                title,
                description,
                category: category || 'uncategorized',
                difficulty: difficulty || 'beginner',
                price: price || 0.00
            });
            
            const course = await CourseModel.findById(courseId);
            
            res.status(201).json({
                message: 'Course created successfully',
                course
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create course' });
        }
    }
    
    // Update course
    static async updateCourse(req, res) {
        try {
            const courseId = req.params.id;
            const updates = req.body;
            
            // Check if course exists
            const course = await CourseModel.findById(courseId);
            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }
            
            // Update course
            const updatedCourse = await CourseModel.update(courseId, updates);
            
            res.json({
                message: 'Course updated successfully',
                course: updatedCourse
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update course' });
        }
    }
    
    // Delete course
    static async deleteCourse(req, res) {
        try {
            const courseId = req.params.id;
            
            // Check if course exists
            const course = await CourseModel.findById(courseId);
            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }
            
            // Delete course
            await CourseModel.delete(courseId);
            
            res.json({
                message: 'Course deleted successfully',
                deleted_course: {
                    id: course.id,
                    title: course.title
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete course' });
        }
    }
    
    // 3. PAYMENT MANAGEMENT
    
    // Get all payments
    static async getPayments(req, res) {
        try {
            const { page = 1, limit = 50, status = '' } = req.query;
            const offset = (page - 1) * limit;
            
            let query = `SELECT * FROM payments WHERE 1=1`;
            const params = [];
            
            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }
            
            query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
            
            const [payments] = await executeQuery(query, params);
            
            // Get total count
            const [countResult] = await executeQuery(
                'SELECT COUNT(*) as total FROM payments WHERE 1=1',
                params.slice(0, -2)
            );
            
            // Get payment stats
            const [stats] = await executeQuery(`
                SELECT 
                    COUNT(*) as total_payments,
                    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_payments
                FROM payments
            `);
            
            res.json({
                payments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                },
                statistics: stats[0]
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get payments' });
        }
    }
    
    // Update payment status
    static async updatePayment(req, res) {
        try {
            const paymentId = req.params.id;
            const { status } = req.body;
            
            // Check if payment exists
            const [payment] = await executeQuery(
                'SELECT * FROM payments WHERE id = ?',
                [paymentId]
            );
            
            if (payment.length === 0) {
                return res.status(404).json({ error: 'Payment not found' });
            }
            
            // Update payment
            await executeQuery(
                'UPDATE payments SET status = ? WHERE id = ?',
                [status, paymentId]
            );
            
            // Get updated payment
            const [updatedPayment] = await executeQuery(
                'SELECT * FROM payments WHERE id = ?',
                [paymentId]
            );
            
            res.json({
                message: 'Payment updated successfully',
                payment: updatedPayment[0]
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update payment' });
        }
    }
    
    // 4. PROJECT MANAGEMENT
    
    // Get all projects
    static async getProjects(req, res) {
        try {
            const { page = 1, limit = 20, status = '' } = req.query;
            const offset = (page - 1) * limit;
            
            let query = `SELECT * FROM projects WHERE 1=1`;
            const params = [];
            
            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }
            
            query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
            
            const [projects] = await executeQuery(query, params);
            
            // Get total count
            const [countResult] = await executeQuery(
                'SELECT COUNT(*) as total FROM projects WHERE 1=1',
                params.slice(0, -2)
            );
            
            res.json({
                projects,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get projects' });
        }
    }
    
    // Update project status
    static async updateProject(req, res) {
        try {
            const projectId = req.params.id;
            const { status, grade, feedback } = req.body;
            
            // Check if project exists
            const [project] = await executeQuery(
                'SELECT * FROM projects WHERE id = ?',
                [projectId]
            );
            
            if (project.length === 0) {
                return res.status(404).json({ error: 'Project not found' });
            }
            
            // Prepare updates
            const updates = {};
            if (status) updates.status = status;
            if (grade !== undefined) updates.grade = grade;
            if (feedback !== undefined) updates.feedback = feedback;
            
            if (status === 'completed') {
                updates.completed_at = new Date();
            }
            
            // Update project
            await executeQuery(
                'UPDATE projects SET ? WHERE id = ?',
                [updates, projectId]
            );
            
            res.json({
                message: 'Project updated successfully'
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update project' });
        }
    }
    
    // 5. SYSTEM STATISTICS
    
    // Get system statistics
    static async getSystemStats(req, res) {
        try {
            // Get all counts in parallel
            const [
                [totalUsers],
                [activeUsers],
                [totalCourses],
                [totalPayments],
                [revenue]
            ] = await Promise.all([
                executeQuery('SELECT COUNT(*) as count FROM users'),
                executeQuery('SELECT COUNT(*) as count FROM users WHERE last_active >= DATE_SUB(NOW(), INTERVAL 7 DAY)'),
                executeQuery('SELECT COUNT(*) as count FROM courses'),
                executeQuery('SELECT COUNT(*) as count FROM payments WHERE status = "completed"'),
                executeQuery('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = "completed"')
            ]);
            
            // Get recent users (last 7 days)
            const [recentUsers] = await executeQuery(`
                SELECT id, email, name, created_at 
                FROM users 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ORDER BY created_at DESC 
                LIMIT 10
            `);
            
            // Get popular courses
            const [popularCourses] = await executeQuery(`
                SELECT id, title, total_students, rating
                FROM courses
                WHERE is_published = TRUE
                ORDER BY total_students DESC
                LIMIT 10
            `);
            
            res.json({
                overview: {
                    users: totalUsers[0].count,
                    active_users: activeUsers[0].count,
                    courses: totalCourses[0].count,
                    payments: totalPayments[0].count,
                    revenue: parseFloat(revenue[0].total).toFixed(2)
                },
                recent_users: recentUsers,
                popular_courses: popularCourses
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get system statistics' });
        }
    }
    
    // 6. NOTIFICATION SYSTEM
    
    // Send notification to all users
    static async broadcastNotification(req, res) {
        try {
            const { title, message } = req.body;
            
            if (!title || !message) {
                return res.status(400).json({ error: 'Title and message are required' });
            }
            
            // Get all users
            const [users] = await executeQuery('SELECT id FROM users');
            
            if (users.length === 0) {
                return res.json({ message: 'No users to notify' });
            }
            
            // Create notifications for all users
            const notifications = users.map(user => [
                user.id,
                'info',
                title,
                message,
                'megaphone'
            ]);
            
            // Insert all notifications
            await executeQuery(
                'INSERT INTO notifications (user_id, type, title, message, icon) VALUES ?',
                [notifications]
            );
            
            res.json({
                message: `Notification sent to ${users.length} users`,
                notified: users.length
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to send notification' });
        }
    }
    
    // 7. CERTIFICATE MANAGEMENT
    
    // Get all certificates
    static async getCertificates(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;
            
            const [certificates] = await executeQuery(
                `SELECT c.*, u.name as user_name, u.email as user_email
                 FROM certificates c
                 LEFT JOIN users u ON c.user_id = u.id
                 ORDER BY c.issue_date DESC
                 LIMIT ? OFFSET ?`,
                [parseInt(limit), parseInt(offset)]
            );
            
            // Get total count
            const [countResult] = await executeQuery('SELECT COUNT(*) as total FROM certificates');
            
            res.json({
                certificates,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get certificates' });
        }
    }
    
    // Verify certificate
    static async verifyCertificate(req, res) {
        try {
            const certificateId = req.params.id;
            const { is_verified } = req.body;
            
            // Check if certificate exists
            const [certificate] = await executeQuery(
                'SELECT * FROM certificates WHERE id = ?',
                [certificateId]
            );
            
            if (certificate.length === 0) {
                return res.status(404).json({ error: 'Certificate not found' });
            }
            
            // Update certificate
            await executeQuery(
                'UPDATE certificates SET is_verified = ? WHERE id = ?',
                [is_verified ? 1 : 0, certificateId]
            );
            
            res.json({
                message: `Certificate ${is_verified ? 'verified' : 'unverified'} successfully`
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update certificate' });
        }
    }
    
    // 8. DASHBOARD OVERVIEW
    
    // Get dashboard summary
    static async getDashboardOverview(req, res) {
        try {
            // Get today's stats
            const [todayStats] = await executeQuery(`
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE created_at >= CURDATE()) as new_users_today,
                    (SELECT COUNT(*) FROM payments WHERE status = 'completed' AND created_at >= CURDATE()) as payments_today,
                    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed' AND created_at >= CURDATE()) as revenue_today
            `);
            
            // Get recent activities
            const [recentActivities] = await executeQuery(`
                SELECT a.*, u.name as user_name
                FROM activities a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at DESC
                LIMIT 10
            `);
            
            // Get recent payments
            const [recentPayments] = await executeQuery(`
                SELECT p.*, u.name as user_name
                FROM payments p
                LEFT JOIN users u ON p.user_id = u.id
                WHERE p.status = 'completed'
                ORDER BY p.created_at DESC
                LIMIT 5
            `);
            
            res.json({
                today: todayStats[0],
                recent_activities: recentActivities,
                recent_payments: recentPayments
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get dashboard data' });
        }
    }
    
    // 9. SYSTEM LOGS
    
    // Get system logs
    static async getSystemLogs(req, res) {
        try {
            const { page = 1, limit = 100 } = req.query;
            const offset = (page - 1) * limit;
            
            const [logs] = await executeQuery(`
                SELECT a.*, u.name as user_name, u.email as user_email
                FROM activities a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at DESC
                LIMIT ? OFFSET ?`,
                [parseInt(limit), parseInt(offset)]
            );
            
            // Get total count
            const [countResult] = await executeQuery('SELECT COUNT(*) as total FROM activities');
            
            res.json({
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get system logs' });
        }
    }
    
    // 10. EXPORT DATA
    
    // Export data as CSV
    static async exportData(req, res) {
        try {
            const { type } = req.query;
            
            if (!type) {
                return res.status(400).json({ error: 'Export type is required' });
            }
            
            let query;
            let filename;
            
            switch (type) {
                case 'users':
                    query = 'SELECT id, email, name, role, created_at FROM users';
                    filename = 'users_export';
                    break;
                    
                case 'courses':
                    query = 'SELECT id, title, category, difficulty, price, created_at FROM courses';
                    filename = 'courses_export';
                    break;
                    
                case 'payments':
                    query = 'SELECT id, user_id, amount, status, created_at FROM payments';
                    filename = 'payments_export';
                    break;
                    
                default:
                    return res.status(400).json({ error: 'Invalid export type' });
            }
            
            const [data] = await executeQuery(query);
            
            // Convert to CSV
            const csvData = data.length > 0 ? 
                [Object.keys(data[0]).join(',')]
                    .concat(data.map(row => Object.values(row).join(',')))
                    .join('\n') : '';
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            res.send(csvData);
        } catch (error) {
            res.status(500).json({ error: 'Failed to export data' });
        }
    }
}

module.exports = AdminController;