// controllers/userController.js - User controller
const {
    UserModel,
    CourseModel,
    ProjectModel,
    CertificateModel,
    NotificationModel,
    ActivityModel,
    SkillModel,
    AchievementModel,
    StatsModel,
    PaymentModel
} = require('../models/models');

class UserController {
    // Get user notifications
    static async getNotifications(req, res) {
        try {
            const { limit = 50, offset = 0, unread_only = false } = req.query;
            
            const notifications = await NotificationModel.getUserNotifications(req.user.id, {
                limit: parseInt(limit),
                offset: parseInt(offset),
                unread_only: unread_only === 'true'
            });
            
            // Get unread count
            const unreadCount = await NotificationModel.getUnreadCount(req.user.id);
            
            res.json({
                notifications,
                unread_count: unreadCount,
                total: notifications.length
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                error: 'Failed to get notifications',
                code: 'NOTIFICATIONS_FETCH_FAILED'
            });
        }
    }
    
    // Mark notification as read
    static async markNotificationAsRead(req, res) {
        try {
            await NotificationModel.markAsRead(req.params.id, req.user.id);
            
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
    }
    
    // Mark all notifications as read
    static async markAllNotificationsAsRead(req, res) {
        try {
            await NotificationModel.markAllAsRead(req.user.id);
            
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
    }
    
    // Get user activities
    static async getActivities(req, res) {
        try {
            const { limit = 20, offset = 0 } = req.query;
            
            const activities = await ActivityModel.getUserActivities(req.user.id, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
            res.json(activities);
        } catch (error) {
            console.error('Get activities error:', error);
            res.status(500).json({
                error: 'Failed to get activities',
                code: 'ACTIVITIES_FETCH_FAILED'
            });
        }
    }
    
    // Get user courses
    static async getCourses(req, res) {
        try {
            const { status = 'all' } = req.query;
            const courses = await CourseModel.getUserCourses(req.user.id, status);
            res.json(courses);
        } catch (error) {
            console.error('Get user courses error:', error);
            res.status(500).json({
                error: 'Failed to get courses',
                code: 'COURSES_FETCH_FAILED'
            });
        }
    }
    
    // Get user projects
    static async getProjects(req, res) {
        try {
            const { status = 'all', limit = 20, offset = 0 } = req.query;
            
            const projects = await ProjectModel.getUserProjects(req.user.id, {
                status,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
            res.json(projects);
        } catch (error) {
            console.error('Get projects error:', error);
            res.status(500).json({
                error: 'Failed to get projects',
                code: 'PROJECTS_FETCH_FAILED'
            });
        }
    }
    
    // Get user certificates
    static async getCertificates(req, res) {
        try {
            const certificates = await CertificateModel.getUserCertificates(req.user.id);
            res.json(certificates);
        } catch (error) {
            console.error('Get certificates error:', error);
            res.status(500).json({
                error: 'Failed to get certificates',
                code: 'CERTIFICATES_FETCH_FAILED'
            });
        }
    }
    
    // Get user statistics
    static async getStats(req, res) {
        try {
            const stats = await StatsModel.getUserStats(req.user.id);
            
            // Calculate XP progress
            const xpForNextLevel = (stats.level * 1000);
            const currentLevelXP = stats.xp % 1000;
            const xpProgress = Math.min((currentLevelXP / 1000) * 100, 100);
            
            res.json({
                ...stats,
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
    }
    
    // Get user skills
    static async getSkills(req, res) {
        try {
            const skills = await SkillModel.getUserSkills(req.user.id);
            res.json(skills);
        } catch (error) {
            console.error('Get skills error:', error);
            res.status(500).json({
                error: 'Failed to get skills',
                code: 'SKILLS_FETCH_FAILED'
            });
        }
    }
    
    // Add/update user skill
    static async upsertSkill(req, res) {
        try {
            const { skill_name, skill_level, experience_years } = req.body;
            
            if (!skill_name || skill_level === undefined) {
                return res.status(400).json({
                    error: 'Skill name and level are required',
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Add/update skill
            const skill = await SkillModel.upsert({
                user_id: req.user.id,
                skill_name,
                skill_level,
                experience_years: experience_years || 0
            });
            
            // Create activity
            if (skill) {
                await ActivityModel.create({
                    user_id: req.user.id,
                    type: 'skill_added',
                    title: 'Skill added/updated',
                    description: `Skill: ${skill_name} (Level ${skill_level})`
                });
                
                // Send real-time update
                if (global.sendToUser) {
                    global.sendToUser(req.user.id, 'skill_updated', skill);
                }
            }
            
            res.json({
                message: skill_name.includes('updated') ? 'Skill updated successfully' : 'Skill added successfully',
                skill
            });
        } catch (error) {
            console.error('Add/update skill error:', error);
            res.status(500).json({
                error: 'Failed to update skill',
                code: 'SKILL_UPDATE_FAILED'
            });
        }
    }
    
    // Delete skill
    static async deleteSkill(req, res) {
        try {
            await SkillModel.delete(req.params.id, req.user.id);
            
            res.json({
                message: 'Skill deleted successfully'
            });
        } catch (error) {
            console.error('Delete skill error:', error);
            res.status(500).json({
                error: 'Failed to delete skill',
                code: 'SKILL_DELETE_FAILED'
            });
        }
    }
    
    // Get user achievements
    static async getAchievements(req, res) {
        try {
            const achievements = await AchievementModel.getUserAchievements(req.user.id);
            res.json(achievements);
        } catch (error) {
            console.error('Get achievements error:', error);
            res.status(500).json({
                error: 'Failed to get achievements',
                code: 'ACHIEVEMENTS_FETCH_FAILED'
            });
        }
    }
    
    // Get user payments
    static async getPayments(req, res) {
        try {
            const { limit = 20, offset = 0 } = req.query;
            
            const payments = await PaymentModel.getUserPayments(req.user.id, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
            res.json(payments);
        } catch (error) {
            console.error('Get payments error:', error);
            res.status(500).json({
                error: 'Failed to get payments',
                code: 'PAYMENTS_FETCH_FAILED'
            });
        }
    }
    
    // AI Chat endpoint
    static async chatWithAI(req, res) {
        try {
            const { message } = req.body;
            
            if (!message || message.trim().length === 0) {
                return res.status(400).json({
                    error: 'Message is required',
                    code: 'MESSAGE_REQUIRED'
                });
            }
            
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
            
            // In a real implementation, you would:
            // 1. Save the user message to database
            // 2. Call an AI API (OpenAI, Anthropic, etc.)
            // 3. Save the AI response
            // 4. Return the response
            
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
    }
    
    // Get user progress chart data
    static async getProgressData(req, res) {
        try {
            // This is a simplified version. In production, you would query actual progress data
            const weeklyData = [1200, 1900, 1500, 2200, 1800, 2400, 2100];
            
            res.json({
                weekly: weeklyData,
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            });
        } catch (error) {
            console.error('Get progress data error:', error);
            res.status(500).json({
                error: 'Failed to get progress data',
                code: 'PROGRESS_DATA_FETCH_FAILED'
            });
        }
    }
    
    // Get user skill distribution
    static async getSkillDistribution(req, res) {
        try {
            const skills = await SkillModel.getUserSkills(req.user.id);
            
            // Default skills if none exist
            if (skills.length === 0) {
                const defaultSkills = [
                    { skill_name: 'JavaScript', skill_level: 75 },
                    { skill_name: 'React', skill_level: 80 },
                    { skill_name: 'Node.js', skill_level: 70 },
                    { skill_name: 'Python', skill_level: 65 },
                    { skill_name: 'AI/ML', skill_level: 60 },
                    { skill_name: 'DevOps', skill_level: 55 }
                ];
                
                // Insert default skills
                for (const skill of defaultSkills) {
                    await SkillModel.upsert({
                        user_id: req.user.id,
                        skill_name: skill.skill_name,
                        skill_level: skill.skill_level
                    });
                }
                
                const skillLevels = defaultSkills.map(s => s.skill_level);
                res.json({ levels: skillLevels });
            } else {
                // Map to chart data format
                const skillNames = ['JavaScript', 'React', 'Node.js', 'Python', 'AI/ML', 'DevOps'];
                const skillLevels = skillNames.map(skillName => {
                    const skill = skills.find(s => s.skill_name === skillName);
                    return skill ? skill.skill_level : 0;
                });
                
                res.json({ levels: skillLevels });
            }
        } catch (error) {
            console.error('Get skill distribution error:', error);
            res.status(500).json({
                error: 'Failed to get skill distribution',
                code: 'SKILL_DISTRIBUTION_FETCH_FAILED'
            });
        }
    }
    
    // Update user XP
    static async updateXP(req, res) {
        try {
            const { xp } = req.body;
            
            if (!xp || xp < 0) {
                return res.status(400).json({
                    error: 'Valid XP amount is required',
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Get current user
            const user = await UserModel.findById(req.user.id);
            
            // Calculate new XP and level
            const newXP = user.xp + xp;
            const newLevel = Math.floor(newXP / 1000) + 1;
            
            // Update user
            await UserModel.update(req.user.id, {
                xp: newXP,
                level: newLevel
            });
            
            // Check for level up
            if (newLevel > user.level) {
                // Create level up notification
                await NotificationModel.create({
                    user_id: req.user.id,
                    type: 'success',
                    title: 'Level Up!',
                    message: `Congratulations! You've reached Level ${newLevel}`,
                    icon: 'star'
                });
                
                // Create achievement if it doesn't exist
                const hasAchievement = await AchievementModel.hasAchievement(
                    req.user.id,
                    `Level ${newLevel}`
                );
                
                if (!hasAchievement) {
                    await AchievementModel.create({
                        user_id: req.user.id,
                        name: `Level ${newLevel}`,
                        description: `Reached level ${newLevel}`,
                        icon: 'trophy',
                        points: newLevel * 100,
                        category: 'level'
                    });
                }
                
                // Send real-time notification
                if (global.sendToUser) {
                    global.sendToUser(req.user.id, 'level_up', {
                        level: newLevel,
                        xp: newXP
                    });
                }
            }
            
            // Send XP update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'xp_updated', {
                    xp: newXP,
                    level: newLevel
                });
            }
            
            res.json({
                message: 'XP updated successfully',
                xp: newXP,
                level: newLevel
            });
        } catch (error) {
            console.error('Update XP error:', error);
            res.status(500).json({
                error: 'Failed to update XP',
                code: 'XP_UPDATE_FAILED'
            });
        }
    }
    
    // Update user streak
    static async updateStreak(req, res) {
        try {
            // Get current user
            const user = await UserModel.findById(req.user.id);
            
            // Check if user was active today
            const lastActive = new Date(user.last_active);
            const today = new Date();
            const isSameDay = lastActive.getDate() === today.getDate() &&
                            lastActive.getMonth() === today.getMonth() &&
                            lastActive.getFullYear() === today.getFullYear();
            
            let newStreak = user.streak;
            
            if (!isSameDay) {
                // Check if it's consecutive day
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                
                const isConsecutive = lastActive.getDate() === yesterday.getDate() &&
                                    lastActive.getMonth() === yesterday.getMonth() &&
                                    lastActive.getFullYear() === yesterday.getFullYear();
                
                if (isConsecutive) {
                    newStreak += 1;
                } else {
                    newStreak = 1; // Reset streak
                }
                
                // Update streak
                await UserModel.update(req.user.id, { streak: newStreak });
                
                // Check for streak achievements
                if (newStreak === 7) {
                    await AchievementModel.create({
                        user_id: req.user.id,
                        name: 'Weekly Warrior',
                        description: 'Maintained a 7-day learning streak',
                        icon: 'fire',
                        points: 500,
                        category: 'streak'
                    });
                } else if (newStreak === 30) {
                    await AchievementModel.create({
                        user_id: req.user.id,
                        name: 'Monthly Master',
                        description: 'Maintained a 30-day learning streak',
                        icon: 'crown',
                        points: 1000,
                        category: 'streak'
                    });
                }
                
                // Send real-time update
                if (global.sendToUser) {
                    global.sendToUser(req.user.id, 'streak_updated', {
                        streak: newStreak
                    });
                }
            }
            
            res.json({
                streak: newStreak,
                message: 'Streak updated'
            });
        } catch (error) {
            console.error('Update streak error:', error);
            res.status(500).json({
                error: 'Failed to update streak',
                code: 'STREAK_UPDATE_FAILED'
            });
        }
    }
}

module.exports = UserController;