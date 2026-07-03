const express = require('express');
const router = express.Router();
const { authenticateToken, authenticateAdminOrInstructor } = require('../middleware/auth');
const { executeQuery } = require('../models/db');

// List quizzes for a course
router.get('/course/:courseId', authenticateToken, async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const [quizzes] = await executeQuery(
            'SELECT id, title, description, passing_score, time_limit_minutes, is_active FROM quizzes WHERE course_id = ? AND is_active = TRUE',
            [courseId]
        );
        res.json(quizzes);
    } catch (err) {
        console.error('Get quizzes error:', err);
        res.status(500).json({ error: 'Failed to get quizzes', code: 'QUIZZES_FETCH_FAILED' });
    }
});

// Get quiz details (questions + choices) - do NOT expose correct flags
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const quizId = req.params.id;
        const [quizzes] = await executeQuery('SELECT id, course_id, title, description, passing_score, time_limit_minutes FROM quizzes WHERE id = ? AND is_active = TRUE', [quizId]);
        if (quizzes.length === 0) return res.status(404).json({ error: 'Quiz not found', code: 'QUIZ_NOT_FOUND' });
        const quiz = quizzes[0];

        const [questions] = await executeQuery('SELECT id, question_text, question_type, points, sort_order FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC', [quizId]);
        for (const q of questions) {
            const [choices] = await executeQuery('SELECT id, text FROM quiz_choices WHERE question_id = ? ORDER BY sort_order ASC', [q.id]);
            q.choices = choices;
        }

        res.json({ quiz, questions });
    } catch (err) {
        console.error('Get quiz error:', err);
        res.status(500).json({ error: 'Failed to get quiz', code: 'QUIZ_FETCH_FAILED' });
    }
});

// Submit quiz answers
router.post('/:id/submit', authenticateToken, async (req, res) => {
    try {
        const quizId = req.params.id;
        const userId = req.user.id;
        const { answers = [], time_taken_seconds = 0 } = req.body;

        // Load quiz and questions including correct answers
        const [quizzes] = await executeQuery('SELECT id, course_id, title, passing_score FROM quizzes WHERE id = ? AND is_active = TRUE', [quizId]);
        if (quizzes.length === 0) return res.status(404).json({ error: 'Quiz not found', code: 'QUIZ_NOT_FOUND' });
        const quiz = quizzes[0];

        const [questions] = await executeQuery('SELECT id, question_text, question_type, points FROM quiz_questions WHERE quiz_id = ?', [quizId]);
        if (questions.length === 0) return res.status(400).json({ error: 'Quiz has no questions', code: 'NO_QUESTIONS' });

        // Map questions
        const qMap = {};
        for (const q of questions) qMap[q.id] = q;

        // Get choices for all questions with correctness
        const [allChoices] = await executeQuery('SELECT id, question_id, is_correct FROM quiz_choices WHERE question_id IN (' + questions.map(() => '?').join(',') + ')', questions.map(q => q.id));
        const correctMap = {};
        for (const c of allChoices) {
            if (!correctMap[c.question_id]) correctMap[c.question_id] = [];
            if (c.is_correct) correctMap[c.question_id].push(c.id);
        }

        // Create attempt
        const [attemptResult] = await executeQuery(
            'INSERT INTO user_quiz_attempts (user_id, quiz_id, started_at, completed_at, time_taken_seconds) VALUES (?, ?, NOW(), NOW(), ?)',
            [userId, quizId, time_taken_seconds]
        );
        const attemptId = attemptResult.insertId;

        // Grade answers
        let totalPoints = 0;
        let awardedPoints = 0;

        for (const q of questions) {
            totalPoints += q.points || 0;
            const submitted = answers.find(a => parseInt(a.question_id) === parseInt(q.id));
            let pointsAwarded = 0;
            let isCorrect = false;
            let choiceId = null;
            let answerText = null;

            if (submitted) {
                if (q.question_type === 'single') {
                    choiceId = submitted.choice_id || null;
                    const correctChoices = correctMap[q.id] || [];
                    if (choiceId && correctChoices.includes(parseInt(choiceId))) {
                        isCorrect = true;
                        pointsAwarded = q.points || 0;
                    }
                } else if (q.question_type === 'multiple') {
                    const selected = Array.isArray(submitted.choice_ids) ? submitted.choice_ids.map(Number) : [];
                    const correctChoices = (correctMap[q.id] || []).map(Number).sort();
                    const selSorted = selected.slice().map(Number).sort();
                    // award full points only if exact match
                    if (JSON.stringify(correctChoices) === JSON.stringify(selSorted)) {
                        isCorrect = true;
                        pointsAwarded = q.points || 0;
                    }
                    // For partial credit, could be added here
                } else { // short
                    answerText = submitted.answer_text || null;
                    // short answers require manual grading; leave points 0
                    isCorrect = false;
                    pointsAwarded = 0;
                }
            }

            awardedPoints += pointsAwarded;

            await executeQuery(
                'INSERT INTO user_quiz_answers (attempt_id, question_id, choice_id, answer_text, is_correct, points_awarded) VALUES (?, ?, ?, ?, ?, ?)',
                [attemptId, q.id, choiceId, answerText, isCorrect, pointsAwarded]
            );
        }

        // Calculate score
        const scorePercent = totalPoints > 0 ? Math.round((awardedPoints / totalPoints) * 100) : 0;
        const passed = scorePercent >= (quiz.passing_score || 70);

        // Update attempt with final score and pass flag
        await executeQuery('UPDATE user_quiz_attempts SET score = ?, passed = ? WHERE id = ?', [scorePercent, passed, attemptId]);

        // If passed, mark course as completed (if enrolled) and award certificate
        let certificate = null;
        if (passed) {
            // mark user_course completed if exists
            const [enrollments] = await executeQuery('SELECT id, completed FROM user_courses WHERE user_id = ? AND course_id = ?', [userId, quiz.course_id]);
            if (enrollments.length > 0 && !enrollments[0].completed) {
                const enrollmentId = enrollments[0].id;
                await executeQuery('UPDATE user_courses SET completed = TRUE, completed_at = CURRENT_TIMESTAMP, progress = 100 WHERE id = ?', [enrollmentId]);

                // Award XP
                await executeQuery('UPDATE users SET xp = xp + 500 WHERE id = ?', [userId]);

                // Create certificate
                const certificateId = `TUMI-${quiz.course_id}-${Date.now()}-${userId}`;
                const verificationUrl = `${process.env.FRONTEND_URL}/verify/${certificateId}`;
                await executeQuery(
                    `INSERT INTO certificates (user_id, course_id, certificate_id, full_name, course_title, verification_url, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [userId, quiz.course_id, certificateId, req.user.name || '', quiz.title || '']
                );

                const [certs] = await executeQuery('SELECT * FROM certificates WHERE certificate_id = ?', [certificateId]);
                certificate = certs[0] || null;

                // Create activities and notifications
                await executeQuery('INSERT INTO activities (user_id, type, title, reference_id, reference_type) VALUES (?, ?, ?, ?, ?)', [userId, 'course_completed', `Completed course via quiz: ${quiz.title}`, quiz.course_id, 'course']);
                await executeQuery('INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)', [userId, 'success', 'Course Completed', `You passed the quiz and completed the course!`, 'check-circle']);

                if (global.sendToUser) {
                    global.sendToUser(userId, 'quiz_passed', { quiz_id: quizId, course_id: quiz.course_id, certificate });
                }
            }
        }

        res.json({ message: 'Quiz submitted', score: scorePercent, passed, certificate });
    } catch (err) {
        console.error('Submit quiz error:', err);
        res.status(500).json({ error: 'Failed to submit quiz', code: 'QUIZ_SUBMIT_FAILED' });
    }
});

// Admin: create quiz for course
router.post('/course/:courseId', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const { title, description, passing_score = 70, time_limit_minutes = 0, questions = [] } = req.body;

        const [result] = await executeQuery('INSERT INTO quizzes (course_id, title, description, passing_score, time_limit_minutes, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [courseId, title, description, passing_score, time_limit_minutes]);
        const quizId = result.insertId;

        // Insert questions and choices
        for (const [i, q] of questions.entries()) {
            const [qres] = await executeQuery('INSERT INTO quiz_questions (quiz_id, question_text, question_type, points, sort_order, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [quizId, q.question_text, q.question_type || 'single', q.points || 1, i]);
            const questionId = qres.insertId;
            if (Array.isArray(q.choices)) {
                for (const [j, c] of q.choices.entries()) {
                    await executeQuery('INSERT INTO quiz_choices (question_id, text, is_correct, sort_order) VALUES (?, ?, ?, ?)', [questionId, c.text, c.is_correct ? 1 : 0, j]);
                }
            }
        }

        res.status(201).json({ message: 'Quiz created', quizId });
    } catch (err) {
        console.error('Create quiz error:', err);
        res.status(500).json({ error: 'Failed to create quiz', code: 'QUIZ_CREATE_FAILED' });
    }
});

// Admin: list all quizzes (with optional filters)
router.get('/', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;
        const [rows] = await executeQuery('SELECT id, course_id, title, passing_score, time_limit_minutes, is_active, created_at FROM quizzes ORDER BY created_at DESC LIMIT ? OFFSET ?', [parseInt(limit), parseInt(offset)]);
        res.json(rows);
    } catch (err) {
        console.error('List quizzes error:', err);
        res.status(500).json({ error: 'Failed to list quizzes', code: 'QUIZZES_LIST_FAILED' });
    }
});

// Admin: get attempts for a quiz
router.get('/:id/attempts', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const quizId = req.params.id;
        const [attempts] = await executeQuery('SELECT id, user_id, score, passed, started_at, completed_at, time_taken_seconds FROM user_quiz_attempts WHERE quiz_id = ? ORDER BY completed_at DESC', [quizId]);
        res.json(attempts);
    } catch (err) {
        console.error('Get quiz attempts error:', err);
        res.status(500).json({ error: 'Failed to get attempts', code: 'ATTEMPTS_FETCH_FAILED' });
    }
});

// Admin: get attempt details including answers
router.get('/attempts/:attemptId', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const attemptId = req.params.attemptId;
        const [attempts] = await executeQuery('SELECT * FROM user_quiz_attempts WHERE id = ?', [attemptId]);
        if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found', code: 'ATTEMPT_NOT_FOUND' });
        const attempt = attempts[0];
        const [answers] = await executeQuery('SELECT a.*, q.question_text FROM user_quiz_answers a JOIN quiz_questions q ON a.question_id = q.id WHERE a.attempt_id = ?', [attemptId]);
        res.json({ attempt, answers });
    } catch (err) {
        console.error('Get attempt error:', err);
        res.status(500).json({ error: 'Failed to get attempt', code: 'ATTEMPT_FETCH_FAILED' });
    }
});

// Admin: grade an attempt (manual grading for short answers)
router.post('/attempts/:attemptId/grade', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const attemptId = req.params.attemptId;
        const { grades = [] } = req.body; // [{answer_id, points_awarded, is_correct}]

        // Update each answer
        let totalAwarded = 0;
        for (const g of grades) {
            await executeQuery('UPDATE user_quiz_answers SET points_awarded = ?, is_correct = ? WHERE id = ?', [g.points_awarded || 0, g.is_correct ? 1 : 0, g.answer_id]);
            totalAwarded += (g.points_awarded || 0);
        }

        // Recalculate attempt score: sum points_awarded / total possible
        const [awardedRows] = await executeQuery('SELECT SUM(points_awarded) as awarded FROM user_quiz_answers WHERE attempt_id = ?', [attemptId]);
        const [totalRows] = await executeQuery('SELECT SUM(q.points) as total FROM user_quiz_answers a JOIN quiz_questions q ON a.question_id = q.id WHERE a.attempt_id = ?', [attemptId]);

        const awarded = awardedRows[0].awarded || 0;
        const total = totalRows[0].total || 0;
        const scorePercent = total > 0 ? Math.round((awarded / total) * 100) : 0;

        // Update attempt
        await executeQuery('UPDATE user_quiz_attempts SET score = ?, passed = ? WHERE id = ?', [scorePercent, 0, attemptId]);

        res.json({ message: 'Attempt graded', score: scorePercent });
    } catch (err) {
        console.error('Grade attempt error:', err);
        res.status(500).json({ error: 'Failed to grade attempt', code: 'GRADE_FAILED' });
    }
});

// Admin: update quiz
router.put('/:id', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const quizId = req.params.id;
        const { title, description, passing_score, time_limit_minutes, is_active } = req.body;
        const updates = [];
        const params = [];
        if (title !== undefined) { updates.push('title = ?'); params.push(title); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (passing_score !== undefined) { updates.push('passing_score = ?'); params.push(passing_score); }
        if (time_limit_minutes !== undefined) { updates.push('time_limit_minutes = ?'); params.push(time_limit_minutes); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
        if (updates.length === 0) return res.status(400).json({ error: 'No updates', code: 'NO_UPDATES' });
        params.push(quizId);
        await executeQuery(`UPDATE quizzes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        res.json({ message: 'Quiz updated' });
    } catch (err) {
        console.error('Update quiz error:', err);
        res.status(500).json({ error: 'Failed to update quiz', code: 'QUIZ_UPDATE_FAILED' });
    }
});

// Admin: delete quiz
router.delete('/:id', authenticateAdminOrInstructor, async (req, res) => {
    try {
        const quizId = req.params.id;
        await executeQuery('DELETE FROM quizzes WHERE id = ?', [quizId]);
        res.json({ message: 'Quiz deleted' });
    } catch (err) {
        console.error('Delete quiz error:', err);
        res.status(500).json({ error: 'Failed to delete quiz', code: 'QUIZ_DELETE_FAILED' });
    }
});

module.exports = router;
