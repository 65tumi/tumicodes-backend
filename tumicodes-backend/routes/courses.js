// routes/courses.js - Course routes
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { executeQuery } = require('../models/db');

// Get all courses
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 12, 
            category = '', 
            difficulty = '',
            search = '',
            sort = 'popular',
            min_price = 0,
            max_price = 10000
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT id, title, slug, short_description, category, difficulty,
                   price, discounted_price, thumbnail_url, duration,
                   rating, total_ratings, total_students, is_featured,
                   created_at, updated_at
            FROM courses
            WHERE is_published = TRUE
        `;
        
        const params = [];
        
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
        let countQuery = 'SELECT COUNT(*) as total FROM courses WHERE is_published = TRUE';
        const countParams = [];
        
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
        
        // Get categories for filters
        const [categories] = await executeQuery(
            'SELECT DISTINCT category FROM courses WHERE is_published = TRUE ORDER BY category'
        );
        
        res.json({
            courses,
            filters: {
                categories: categories.map(c => c.category),
                difficulties: ['beginner', 'intermediate', 'advanced'],
                sort_options: [
                    { value: 'popular', label: 'Most Popular' },
                    { value: 'newest', label: 'Newest' },
                    { value: 'rating', label: 'Highest Rated' },
                    { value: 'price_low', label: 'Price: Low to High' },
                    { value: 'price_high', label: 'Price: High to Low' }
                ]
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({
            error: 'Failed to get courses',
            code: 'COURSES_FETCH_FAILED'
        });
    }
});

// Get course by slug
router.get('/:slug', async (req, res) => {
    try {
        const [courses] = await executeQuery(
            `SELECT c.*, u.name as instructor_name, u.bio as instructor_bio,
                    u.avatar_url as instructor_avatar
             FROM courses c
             LEFT JOIN users u ON c.instructor_id = u.id
             WHERE c.slug = ? AND c.is_published = TRUE`,
            [req.params.slug]
        );
        
        if (courses.length === 0) {
            return res.status(404).json({
                error: 'Course not found',
                code: 'COURSE_NOT_FOUND'
            });
        }
        
        const course = courses[0];
        
        // Get lessons
        const [lessons] = await executeQuery(
            `SELECT id, title, slug, duration, sort_order, is_free, created_at
             FROM lessons 
             WHERE course_id = ?
             ORDER BY sort_order ASC`,
            [course.id]
        );
        
        // Get reviews
        const [reviews] = await executeQuery(
            `SELECT uc.rating, uc.review, uc.completed_at,
                    u.name as user_name, u.avatar_url as user_avatar
             FROM user_courses uc
             JOIN users u ON uc.user_id = u.id
             WHERE uc.course_id = ? AND uc.rating IS NOT NULL
             ORDER BY uc.completed_at DESC
             LIMIT 10`,
            [course.id]
        );
        
        // Get related courses
        const [relatedCourses] = await executeQuery(
            `SELECT id, title, slug, short_description, thumbnail_url, 
                    price, discounted_price, rating, total_students
             FROM courses 
             WHERE category = ? AND id != ? AND is_published = TRUE
             ORDER BY total_students DESC
             LIMIT 4`,
            [course.category, course.id]
        );
        
        res.json({
            course,
            lessons,
            reviews,
            related_courses: relatedCourses
        });
    } catch (error) {
        console.error('Get course error:', error);
        res.status(500).json({
            error: 'Failed to get course',
            code: 'COURSE_FETCH_FAILED'
        });
    }
});

// Enroll in course
router.post('/:id/enroll', authenticateToken, async (req, res) => {
    try {
        const courseId = req.params.id;
        const userId = req.user.id;
        
        // Check if course exists
        const [courses] = await executeQuery(
            'SELECT id, title, price FROM courses WHERE id = ? AND is_published = TRUE',
            [courseId]
        );
        
        if (courses.length === 0) {
            return res.status(404).json({
                error: 'Course not found',
                code: 'COURSE_NOT_FOUND'
            });
        }
        
        const course = courses[0];
        
        // Check if already enrolled
        const [existing] = await executeQuery(
            'SELECT id FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({
                error: 'Already enrolled in this course',
                code: 'ALREADY_ENROLLED'
            });
        }
        
        // For paid courses, check payment
        if (course.price > 0) {
            // Check if payment exists
            const [payments] = await executeQuery(
                `SELECT id FROM payments 
                 WHERE user_id = ? AND course_id = ? AND status = 'completed'
                 LIMIT 1`,
                [userId, courseId]
            );
            
            if (payments.length === 0) {
                return res.status(402).json({
                    error: 'Payment required for this course',
                    code: 'PAYMENT_REQUIRED',
                    course: {
                        id: course.id,
                        title: course.title,
                        price: course.price
                    }
                });
            }
        }
        
        // Enroll user
        await executeQuery(
            `INSERT INTO user_courses (user_id, course_id, started_at) 
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [userId, courseId]
        );
        
        // Create activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title, reference_id, reference_type) VALUES (?, ?, ?, ?, ?)',
            [userId, 'course_started', `Started course: ${course.title}`, courseId, 'course']
        );
        
        // Create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [userId, 'course', 'Course Enrolled', `You've enrolled in "${course.title}"`, 'book-open']
        );
        
        // Send real-time update
        if (global.sendToUser) {
            global.sendToUser(userId, 'course_enrolled', {
                course_id: courseId,
                course_title: course.title,
                progress: 0
            });
        }
        
        res.status(201).json({
            message: 'Successfully enrolled in course',
            course: {
                id: course.id,
                title: course.title,
                progress: 0
            }
        });
    } catch (error) {
        console.error('Enroll error:', error);
        res.status(500).json({
            error: 'Failed to enroll in course',
            code: 'ENROLLMENT_FAILED'
        });
    }
});

// Update course progress
router.put('/:id/progress', authenticateToken, async (req, res) => {
    try {
        const { progress, lesson_id } = req.body;
        const courseId = req.params.id;
        const userId = req.user.id;
        
        if (progress === undefined || progress < 0 || progress > 100) {
            return res.status(400).json({
                error: 'Progress must be between 0 and 100',
                code: 'INVALID_PROGRESS'
            });
        }
        
        // Check if enrolled
        const [enrollments] = await executeQuery(
            'SELECT id, completed FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        
        if (enrollments.length === 0) {
            return res.status(404).json({
                error: 'Not enrolled in this course',
                code: 'NOT_ENROLLED'
            });
        }
        
        const enrollment = enrollments[0];
        
        // Update progress
        await executeQuery(
            `UPDATE user_courses 
             SET progress = ?, current_lesson_id = ?, last_accessed = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [progress, lesson_id || null, enrollment.id]
        );
        
        // Check if course is completed
        if (progress >= 100 && !enrollment.completed) {
            // Get course details
            const [courses] = await executeQuery(
                'SELECT title FROM courses WHERE id = ?',
                [courseId]
            );
            
            if (courses.length > 0) {
                const course = courses[0];
                
                // Mark as completed
                await executeQuery(
                    `UPDATE user_courses 
                     SET completed = TRUE, completed_at = CURRENT_TIMESTAMP, progress = 100
                     WHERE id = ?`,
                    [enrollment.id]
                );
                
                // Award XP
                await executeQuery(
                    'UPDATE users SET xp = xp + 500 WHERE id = ?',
                    [userId]
                );
                
                // Create certificate
                const certificateId = `TUMI-${courseId}-${Date.now()}-${userId}`;
                const verificationUrl = `${process.env.FRONTEND_URL}/verify/${certificateId}`;
                
                await executeQuery(
                    `INSERT INTO certificates 
                     (user_id, course_id, certificate_id, full_name, course_title, verification_url) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [userId, courseId, certificateId, req.user.name, course.title, verificationUrl]
                );
                
                // Create activities
                await executeQuery(
                    'INSERT INTO activities (user_id, type, title, reference_id, reference_type) VALUES (?, ?, ?, ?, ?)',
                    [userId, 'course_completed', `Completed course: ${course.title}`, courseId, 'course']
                );
                
                await executeQuery(
                    'INSERT INTO activities (user_id, type, title, reference_id, reference_type) VALUES (?, ?, ?, ?, ?)',
                    [userId, 'certificate_earned', `Earned certificate: ${course.title}`, courseId, 'certificate']
                );
                
                // Create notifications
                await executeQuery(
                    'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
                    [userId, 'success', 'Course Completed!', `Congratulations! You've completed "${course.title}"`, 'check-circle']
                );
                
                await executeQuery(
                    'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
                    [userId, 'certificate', 'Certificate Earned!', `You've earned a certificate for "${course.title}"`, 'award']
                );
                
                // Get certificate data
                const [certificates] = await executeQuery(
                    'SELECT * FROM certificates WHERE certificate_id = ?',
                    [certificateId]
                );
                
                // Send real-time updates
                if (global.sendToUser) {
                    global.sendToUser(userId, 'course_completed', {
                        course_id: courseId,
                        course_title: course.title,
                        certificate: certificates[0]
                    });
                    
                    // Update user stats
                    const [user] = await executeQuery(
                        'SELECT xp, level FROM users WHERE id = ?',
                        [userId]
                    );
                    global.sendToUser(userId, 'user_updated', user[0]);
                }
            }
        }
        
        // Send progress update
        if (global.sendToUser) {
            global.sendToUser(userId, 'course_progress', {
                course_id: courseId,
                progress: progress
            });
        }
        
        res.json({
            message: 'Progress updated',
            progress
        });
    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({
            error: 'Failed to update progress',
            code: 'PROGRESS_UPDATE_FAILED'
        });
    }
});

// Get course lessons
router.get('/:id/lessons', authenticateToken, async (req, res) => {
    try {
        const courseId = req.params.id;
        const userId = req.user.id;
        
        // Check if enrolled
        const [enrollments] = await executeQuery(
            'SELECT id FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        
        let lessonsQuery = `
            SELECT id, title, slug, content, video_url, duration, sort_order, is_free, created_at
            FROM lessons 
            WHERE course_id = ?
        `;
        const params = [courseId];
        
        if (enrollments.length === 0) {
            lessonsQuery += ' AND is_free = TRUE';
        }
        
        lessonsQuery += ' ORDER BY sort_order ASC';

        const [lessons] = await executeQuery(lessonsQuery, params);
        
        const [progress] = await executeQuery(
            'SELECT progress, current_lesson_id FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        
        if (enrollments.length === 0 && lessons.length === 0) {
            return res.status(403).json({
                error: 'Not enrolled in this course',
                code: 'NOT_ENROLLED'
            });
        }
        
        res.json({
            lessons,
            progress: progress[0]?.progress || 0,
            current_lesson_id: progress[0]?.current_lesson_id || null,
            is_enrolled: enrollments.length > 0
        });
    } catch (error) {
        console.error('Get lessons error:', error);
        res.status(500).json({
            error: 'Failed to get lessons',
            code: 'LESSONS_FETCH_FAILED'
        });
    }
});

// Rate and review course
router.post('/:id/review', authenticateToken, async (req, res) => {
    try {
        const { rating, review } = req.body;
        const courseId = req.params.id;
        const userId = req.user.id;
        
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                error: 'Rating must be between 1 and 5',
                code: 'INVALID_RATING'
            });
        }
        
        // Check if enrolled and completed
        const [enrollments] = await executeQuery(
            'SELECT id, completed FROM user_courses WHERE user_id = ? AND course_id = ?',
            [userId, courseId]
        );
        
        if (enrollments.length === 0) {
            return res.status(403).json({
                error: 'Not enrolled in this course',
                code: 'NOT_ENROLLED'
            });
        }
        
        if (!enrollments[0].completed) {
            return res.status(403).json({
                error: 'Course must be completed before rating',
                code: 'COURSE_NOT_COMPLETED'
            });
        }
        
        // Update review
        await executeQuery(
            'UPDATE user_courses SET rating = ?, review = ? WHERE user_id = ? AND course_id = ?',
            [rating, review || null, userId, courseId]
        );
        
        // Update course average rating
        const [ratings] = await executeQuery(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as count 
             FROM user_courses 
             WHERE course_id = ? AND rating IS NOT NULL`,
            [courseId]
        );
        
        if (ratings.length > 0) {
            await executeQuery(
                'UPDATE courses SET rating = ?, total_ratings = ? WHERE id = ?',
                [ratings[0].avg_rating || 0, ratings[0].count || 0, courseId]
            );
        }
        
        res.json({
            message: 'Review submitted successfully',
            rating,
            review
        });
    } catch (error) {
        console.error('Submit review error:', error);
        res.status(500).json({
            error: 'Failed to submit review',
            code: 'REVIEW_SUBMIT_FAILED'
        });
    }
});

module.exports = router;