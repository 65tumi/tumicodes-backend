// controllers/courseController.js - Course controller
const {
    CourseModel,
    CertificateModel,
    NotificationModel,
    ActivityModel,
    UserModel,
    PaymentModel
} = require('../models/models');

class CourseController {
    // Get all courses
    static async getAllCourses(req, res) {
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
            
            const result = await CourseModel.getAll({
                page: parseInt(page),
                limit: parseInt(limit),
                category,
                difficulty,
                search,
                sort,
                min_price: parseFloat(min_price),
                max_price: parseFloat(max_price),
                is_published: true
            });
            
            // Get categories for filters
            const { executeQuery } = require('../models/db');
            const [categories] = await executeQuery(
                'SELECT DISTINCT category FROM courses WHERE is_published = TRUE ORDER BY category'
            );
            
            res.json({
                ...result,
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
                }
            });
        } catch (error) {
            console.error('Get courses error:', error);
            res.status(500).json({
                error: 'Failed to get courses',
                code: 'COURSES_FETCH_FAILED'
            });
        }
    }
    
    // Get course by slug
    static async getCourseBySlug(req, res) {
        try {
            const course = await CourseModel.findBySlug(req.params.slug);
            if (!course) {
                return res.status(404).json({
                    error: 'Course not found',
                    code: 'COURSE_NOT_FOUND'
                });
            }
            
            // Get lessons
            const { executeQuery } = require('../models/db');
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
            
            // Check if user is enrolled (if authenticated)
            let isEnrolled = false;
            let userProgress = null;
            
            if (req.user) {
                isEnrolled = await CourseModel.isUserEnrolled(req.user.id, course.id);
                if (isEnrolled) {
                    userProgress = await CourseModel.getUserProgress(req.user.id, course.id);
                }
            }
            
            res.json({
                course,
                lessons,
                reviews,
                related_courses: relatedCourses,
                user_data: {
                    is_enrolled: isEnrolled,
                    progress: userProgress?.progress || 0
                }
            });
        } catch (error) {
            console.error('Get course error:', error);
            res.status(500).json({
                error: 'Failed to get course',
                code: 'COURSE_FETCH_FAILED'
            });
        }
    }
    
    // Enroll in course
    static async enrollInCourse(req, res) {
        try {
            const courseId = req.params.id;
            const userId = req.user.id;
            
            // Check if course exists
            const course = await CourseModel.findById(courseId);
            if (!course || !course.is_published) {
                return res.status(404).json({
                    error: 'Course not found',
                    code: 'COURSE_NOT_FOUND'
                });
            }
            
            // Check if already enrolled
            const isEnrolled = await CourseModel.isUserEnrolled(userId, courseId);
            if (isEnrolled) {
                return res.status(400).json({
                    error: 'Already enrolled in this course',
                    code: 'ALREADY_ENROLLED'
                });
            }
            
            // For paid courses, check payment
            if (course.price > 0) {
                // Check if payment exists
                const payment = await PaymentModel.findByTransactionId(`course_${courseId}_user_${userId}`);
                if (!payment || payment.status !== 'completed') {
                    return res.status(402).json({
                        error: 'Payment required for this course',
                        code: 'PAYMENT_REQUIRED',
                        course: {
                            id: course.id,
                            title: course.title,
                            price: course.price,
                            discounted_price: course.discounted_price
                        }
                    });
                }
            }
            
            // Enroll user
            const enrollmentId = await CourseModel.enrollUser(userId, courseId);
            
            // Create activity
            await ActivityModel.create({
                user_id: userId,
                type: 'course_started',
                title: `Started course: ${course.title}`,
                reference_id: courseId,
                reference_type: 'course'
            });
            
            // Create notification
            await NotificationModel.create({
                user_id: userId,
                type: 'course',
                title: 'Course Enrolled',
                message: `You've enrolled in "${course.title}"`,
                icon: 'book-open'
            });
            
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
    }
    
    // Update course progress
    static async updateProgress(req, res) {
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
            const enrollment = await CourseModel.getUserProgress(userId, courseId);
            if (!enrollment) {
                return res.status(404).json({
                    error: 'Not enrolled in this course',
                    code: 'NOT_ENROLLED'
                });
            }
            
            // Update progress
            await CourseModel.updateUserProgress(userId, courseId, progress, lesson_id);
            
            // Check if course is completed
            if (progress >= 100 && !enrollment.completed) {
                // Get course details
                const course = await CourseModel.findById(courseId);
                if (course) {
                    // Mark as completed
                    await CourseModel.markAsCompleted(enrollment.id, course.title);
                    
                    // Award XP
                    await UserModel.update(userId, { xp: (req.user.xp || 0) + 500 });
                    
                    // Create certificate
                    const certificateId = `TUMI-${courseId}-${Date.now()}-${userId}`;
                    const verificationUrl = `${process.env.FRONTEND_URL}/verify/${certificateId}`;
                    
                    await CertificateModel.create({
                        user_id: userId,
                        course_id: courseId,
                        certificate_id: certificateId,
                        full_name: req.user.name,
                        course_title: course.title,
                        verification_url: verificationUrl
                    });
                    
                    // Create activities
                    await ActivityModel.create({
                        user_id: userId,
                        type: 'course_completed',
                        title: `Completed course: ${course.title}`,
                        reference_id: courseId,
                        reference_type: 'course'
                    });
                    
                    await ActivityModel.create({
                        user_id: userId,
                        type: 'certificate_earned',
                        title: `Earned certificate: ${course.title}`,
                        reference_id: courseId,
                        reference_type: 'certificate'
                    });
                    
                    // Create notifications
                    await NotificationModel.create({
                        user_id: userId,
                        type: 'success',
                        title: 'Course Completed!',
                        message: `Congratulations! You've completed "${course.title}"`,
                        icon: 'check-circle'
                    });
                    
                    await NotificationModel.create({
                        user_id: userId,
                        type: 'certificate',
                        title: 'Certificate Earned!',
                        message: `You've earned a certificate for "${course.title}"`,
                        icon: 'award'
                    });
                    
                    // Get certificate data
                    const certificate = await CertificateModel.findByCertificateId(certificateId);
                    
                    // Send real-time updates
                    if (global.sendToUser) {
                        global.sendToUser(userId, 'course_completed', {
                            course_id: courseId,
                            course_title: course.title,
                            certificate
                        });
                        
                        // Update user stats
                        const user = await UserModel.findById(userId);
                        global.sendToUser(userId, 'user_updated', user);
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
    }
    
    // Get course lessons
    static async getLessons(req, res) {
        try {
            const courseId = req.params.id;
            const userId = req.user.id;
            
            // Check if enrolled
            const isEnrolled = await CourseModel.isUserEnrolled(userId, courseId);
            if (!isEnrolled) {
                return res.status(403).json({
                    error: 'Not enrolled in this course',
                    code: 'NOT_ENROLLED'
                });
            }
            
            // Get lessons
            const { executeQuery } = require('../models/db');
            const [lessons] = await executeQuery(
                `SELECT id, title, slug, content, video_url, duration, sort_order, is_free, created_at
                 FROM lessons 
                 WHERE course_id = ?
                 ORDER BY sort_order ASC`,
                [courseId]
            );
            
            // Get user progress
            const progress = await CourseModel.getUserProgress(userId, courseId);
            
            res.json({
                lessons,
                progress: progress?.progress || 0,
                current_lesson_id: progress?.current_lesson_id || null
            });
        } catch (error) {
            console.error('Get lessons error:', error);
            res.status(500).json({
                error: 'Failed to get lessons',
                code: 'LESSONS_FETCH_FAILED'
            });
        }
    }
    
    // Rate and review course
    static async rateCourse(req, res) {
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
            const enrollment = await CourseModel.getUserProgress(userId, courseId);
            if (!enrollment) {
                return res.status(403).json({
                    error: 'Not enrolled in this course',
                    code: 'NOT_ENROLLED'
                });
            }
            
            if (!enrollment.completed) {
                return res.status(403).json({
                    error: 'Course must be completed before rating',
                    code: 'COURSE_NOT_COMPLETED'
                });
            }
            
            // Update review
            const { executeQuery } = require('../models/db');
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
    }
    
    // Get course certificate
    static async getCertificate(req, res) {
        try {
            const courseId = req.params.id;
            const userId = req.user.id;
            
            // Check if course is completed
            const enrollment = await CourseModel.getUserProgress(userId, courseId);
            if (!enrollment || !enrollment.completed) {
                return res.status(403).json({
                    error: 'Course not completed',
                    code: 'COURSE_NOT_COMPLETED'
                });
            }
            
            // Get certificate
            const { executeQuery } = require('../models/db');
            const [certificates] = await executeQuery(
                `SELECT c.*, cr.title as course_title_full
                 FROM certificates c
                 LEFT JOIN courses cr ON c.course_id = cr.id
                 WHERE c.user_id = ? AND c.course_id = ?`,
                [userId, courseId]
            );
            
            if (certificates.length === 0) {
                return res.status(404).json({
                    error: 'Certificate not found',
                    code: 'CERTIFICATE_NOT_FOUND'
                });
            }
            
            res.json(certificates[0]);
        } catch (error) {
            console.error('Get certificate error:', error);
            res.status(500).json({
                error: 'Failed to get certificate',
                code: 'CERTIFICATE_FETCH_FAILED'
            });
        }
    }
    
    // Search courses
    static async searchCourses(req, res) {
        try {
            const { q, category, difficulty, min_price = 0, max_price = 10000 } = req.query;
            
            let query = `
                SELECT id, title, slug, short_description, category, difficulty,
                       price, discounted_price, thumbnail_url, duration,
                       rating, total_ratings, total_students
                FROM courses
                WHERE is_published = TRUE
            `;
            
            const params = [];
            
            if (q) {
                query += ' AND (title LIKE ? OR short_description LIKE ? OR category LIKE ?)';
                params.push(`%${q}%`, `%${q}%`, `%${q}%`);
            }
            
            if (category) {
                query += ' AND category = ?';
                params.push(category);
            }
            
            if (difficulty) {
                query += ' AND difficulty = ?';
                params.push(difficulty);
            }
            
            query += ' AND price BETWEEN ? AND ? ORDER BY total_students DESC LIMIT 20';
            params.push(min_price, max_price);
            
            const { executeQuery } = require('../models/db');
            const [courses] = await executeQuery(query, params);
            
            res.json(courses);
        } catch (error) {
            console.error('Search courses error:', error);
            res.status(500).json({
                error: 'Failed to search courses',
                code: 'COURSE_SEARCH_FAILED'
            });
        }
    }
}

module.exports = CourseController;