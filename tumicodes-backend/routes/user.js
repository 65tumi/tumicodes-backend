// routes/user.js - User routes
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { executeQuery } = require('../models/db');

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await executeQuery(
            `SELECT id, email, name, role, avatar_url, bio, xp, level, streak, 
                    last_active, created_at, updated_at 
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            error: 'Failed to get profile',
            code: 'PROFILE_FETCH_FAILED'
        });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, bio, avatar_url } = req.body;
        
        // Build update query
        const updates = [];
        const params = [];
        
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        
        if (bio !== undefined) {
            updates.push('bio = ?');
            params.push(bio);
        }
        
        if (avatar_url !== undefined) {
            updates.push('avatar_url = ?');
            params.push(avatar_url);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update',
                code: 'NO_UPDATES'
            });
        }
        
        params.push(req.user.id);
        
        await executeQuery(
            `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params
        );
        
        // Create activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [req.user.id, 'profile_updated', 'Profile updated']
        );
        
        // Get updated user
        const [users] = await executeQuery(
            `SELECT id, email, name, role, avatar_url, bio, xp, level, streak, 
                    last_active, created_at, updated_at 
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        
        // Send real-time update
        if (global.sendToUser) {
            global.sendToUser(req.user.id, 'profile_updated', users[0]);
        }
        
        res.json({
            message: 'Profile updated successfully',
            user: users[0]
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            error: 'Failed to update profile',
            code: 'PROFILE_UPDATE_FAILED'
        });
    }
});

// Get user notifications
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0, unread_only = false } = req.query;
        
        let query = `SELECT id, type, title, message, icon, data, is_read, created_at, read_at 
                     FROM notifications WHERE user_id = ?`;
        const params = [req.user.id];
        
        if (unread_only === 'true') {
            query += ' AND is_read = FALSE';
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [notifications] = await executeQuery(query, params);
        
        // Get unread count
        const [unreadCount] = await executeQuery(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );
        
        res.json({
            notifications,
            unread_count: unreadCount[0].count,
            total: notifications.length
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            error: 'Failed to get notifications',
            code: 'NOTIFICATIONS_FETCH_FAILED'
        });
    }
});

// Mark notification as read
router.post('/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await executeQuery(
            'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        
        // Send real-time update
        if (global.sendToUser) {
            global.sendToUser(req.user.id, 'notification_read', { id: req.params.id });
        }
        
        res.json({
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({
            error: 'Failed to mark notification as read',
            code: 'NOTIFICATION_UPDATE_FAILED'
        });
    }
});

// Mark all notifications as read
router.post('/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await executeQuery(
            'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );
        
        // Send real-time update
        if (global.sendToUser) {
            global.sendToUser(req.user.id, 'all_notifications_read', {});
        }
        
        res.json({
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({
            error: 'Failed to mark notifications as read',
            code: 'NOTIFICATIONS_UPDATE_FAILED'
        });
    }
});

// Get user activities
router.get('/activities', authenticateToken, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        
        const [activities] = await executeQuery(
            `SELECT id, type, title, description, reference_id, reference_type, metadata, created_at 
             FROM activities 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [req.user.id, parseInt(limit), parseInt(offset)]
        );
        
        res.json(activities);
    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({
            error: 'Failed to get activities',
            code: 'ACTIVITIES_FETCH_FAILED'
        });
    }
});

// Get user courses
router.get('/courses', authenticateToken, async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        
        let query = `
            SELECT c.id, c.title, c.slug, c.description, c.short_description, c.category, 
                   c.difficulty, c.thumbnail_url, c.duration, c.rating, c.total_ratings,
                   uc.progress, uc.completed, uc.started_at, uc.completed_at, uc.last_accessed,
                   uc.rating as user_rating, uc.review as user_review
            FROM user_courses uc
            JOIN courses c ON uc.course_id = c.id
            WHERE uc.user_id = ? AND c.is_published = TRUE
        `;
        
        const params = [req.user.id];
        
        if (status === 'active') {
            query += ' AND uc.completed = FALSE';
        } else if (status === 'completed') {
            query += ' AND uc.completed = TRUE';
        }
        
        query += ' ORDER BY uc.last_accessed DESC';
        
        const [courses] = await executeQuery(query, params);
        
        res.json(courses);
    } catch (error) {
        console.error('Get user courses error:', error);
        res.status(500).json({
            error: 'Failed to get courses',
            code: 'COURSES_FETCH_FAILED'
        });
    }
});

// Get user projects
router.get('/projects', authenticateToken, async (req, res) => {
    try {
        const { status = 'all', limit = 20, offset = 0 } = req.query;
        
        let query = `
            SELECT id, title, slug, description, thumbnail_url, github_url, live_url, 
                   tags, status, progress, is_public, views_count, likes_count,
                   collaborators, started_at, completed_at, created_at, updated_at
            FROM projects
            WHERE user_id = ?
        `;
        
        const params = [req.user.id];
        
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
        
        res.json(parsedProjects);
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            error: 'Failed to get projects',
            code: 'PROJECTS_FETCH_FAILED'
        });
    }
});

// Get user certificates
router.get('/certificates', authenticateToken, async (req, res) => {
    try {
        const [certificates] = await executeQuery(
            `SELECT c.id, c.certificate_id, c.full_name, c.course_title, 
                    c.issue_date, c.expiry_date, c.download_url, c.verification_url,
                    c.is_verified, c.created_at,
                    cr.title as course_title_full, cr.slug as course_slug
             FROM certificates c
             LEFT JOIN courses cr ON c.course_id = cr.id
             WHERE c.user_id = ?
             ORDER BY c.issue_date DESC`,
            [req.user.id]
        );
        
        res.json(certificates);
    } catch (error) {
        console.error('Get certificates error:', error);
        res.status(500).json({
            error: 'Failed to get certificates',
            code: 'CERTIFICATES_FETCH_FAILED'
        });
    }
});

// Get user statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get counts in parallel
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
        
        // Get XP and level
        const [user] = await executeQuery(
            'SELECT xp, level, streak FROM users WHERE id = ?',
            [userId]
        );
        
        // Calculate XP needed for next level
        const xpForNextLevel = (user[0].level * 1000);
        const currentLevelXP = user[0].xp % 1000;
        const xpProgress = Math.min((currentLevelXP / 1000) * 100, 100);
        
        res.json({
            courses: {
                total: coursesCount[0].count,
                active: activeCoursesCount[0].count,
                completed: completedCoursesCount[0].count
            },
            projects: projectsCount[0].count,
            certificates: certificatesCount[0].count,
            achievements: achievementsCount[0].count,
            xp: user[0].xp,
            level: user[0].level,
            streak: user[0].streak,
            xp_progress: xpProgress,
            xp_for_next_level: xpForNextLevel
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            error: 'Failed to get statistics',
            code: 'STATS_FETCH_FAILED'
        });
    }
});

// Get user skills
router.get('/skills', authenticateToken, async (req, res) => {
    try {
        const [skills] = await executeQuery(
            `SELECT id, skill_name, skill_level, experience_years, projects_count, 
                    is_verified, verified_at, created_at, updated_at
             FROM user_skills 
             WHERE user_id = ?
             ORDER BY skill_level DESC, created_at DESC`,
            [req.user.id]
        );
        
        res.json(skills);
    } catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({
            error: 'Failed to get skills',
            code: 'SKILLS_FETCH_FAILED'
        });
    }
});

// Add/update user skill
router.post('/skills', authenticateToken, async (req, res) => {
    try {
        const { skill_name, skill_level, experience_years } = req.body;
        
        if (!skill_name || skill_level === undefined) {
            return res.status(400).json({
                error: 'Skill name and level are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Check if skill already exists
        const [existing] = await executeQuery(
            'SELECT id FROM user_skills WHERE user_id = ? AND skill_name = ?',
            [req.user.id, skill_name]
        );
        
        if (existing.length > 0) {
            // Update existing skill
            await executeQuery(
                `UPDATE user_skills SET skill_level = ?, experience_years = ?, 
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [skill_level, experience_years || 0, existing[0].id]
            );
            
            // Get updated skill
            const [skills] = await executeQuery(
                'SELECT * FROM user_skills WHERE id = ?',
                [existing[0].id]
            );
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'skill_updated', skills[0]);
            }
            
            res.json({
                message: 'Skill updated successfully',
                skill: skills[0]
            });
        } else {
            // Insert new skill
            const [result] = await executeQuery(
                `INSERT INTO user_skills (user_id, skill_name, skill_level, experience_years) 
                 VALUES (?, ?, ?, ?)`,
                [req.user.id, skill_name, skill_level, experience_years || 0]
            );
            
            // Get new skill
            const [skills] = await executeQuery(
                'SELECT * FROM user_skills WHERE id = ?',
                [result.insertId]
            );
            
            // Create activity
            await executeQuery(
                'INSERT INTO activities (user_id, type, title, description) VALUES (?, ?, ?, ?)',
                [req.user.id, 'skill_added', 'Skill added', `Added skill: ${skill_name} (Level ${skill_level})`]
            );
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'skill_added', skills[0]);
            }
            
            res.status(201).json({
                message: 'Skill added successfully',
                skill: skills[0]
            });
        }
    } catch (error) {
        console.error('Add/update skill error:', error);
        res.status(500).json({
            error: 'Failed to update skill',
            code: 'SKILL_UPDATE_FAILED'
        });
    }
});

// AI Chat endpoint
router.post('/ai/chat', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                error: 'Message is required',
                code: 'MESSAGE_REQUIRED'
            });
        }
        
        // Save user message
        await executeQuery(
            'INSERT INTO chat_messages (user_id, message, is_ai) VALUES (?, ?, FALSE)',
            [req.user.id, message.trim()]
        );
        
        // Simulate AI response (in production, integrate with OpenAI, Claude, etc.)
        const responses = [
            "I can help you with coding questions, project ideas, or learning resources!",
            "Looking for a course recommendation? Try our 'Advanced React Patterns' course!",
            "Need help debugging? Share your code and I'll help you find the issue.",
            "Check out our community projects section for inspiration and collaboration opportunities.",
            "Your learning streak is impressive! Keep up the great work!",
            "I recommend practicing algorithms on our coding challenge platform.",
            "Have you tried our new real-time code collaboration feature?",
            "Your progress in web development is excellent! Consider learning a backend framework next.",
            "Need project feedback? Share it in the community forum for constructive reviews.",
            "Remember to take breaks and stay hydrated while coding! Consistency is key. 💻"
        ];
        
        const randomIndex = Math.floor(Math.random() * responses.length);
        const aiResponse = responses[randomIndex];
        
        // Save AI response
        await executeQuery(
            'INSERT INTO chat_messages (user_id, message, is_ai) VALUES (?, ?, TRUE)',
            [req.user.id, aiResponse]
        );
        
        res.json({
            response: aiResponse,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({
            error: 'AI service unavailable',
            code: 'AI_SERVICE_UNAVAILABLE'
        });
    }
});

module.exports = router;