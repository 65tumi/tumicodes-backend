// models/db.js - Database connection and initialization
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

// Create connection pool
function createPool() {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'tumicodes',
        waitForConnections: true,
        connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    // Test connection
    pool.getConnection()
        .then(connection => {
            console.log('✅ Connected to MySQL database');
            connection.release();
        })
        .catch(error => {
            console.error('❌ Database connection error:', error.message);
            // Retry connection after 5 seconds
            setTimeout(createPool, 5000);
        });

    return pool;
}

// Get database connection
async function getConnection() {
    if (!pool) {
        pool = createPool();
    }
    return await pool.getConnection();
}

// Execute query with parameters
async function executeQuery(sql, params = []) {
    let connection;
    try {
        connection = await getConnection();
        const [results] = await connection.execute(sql, params);
        return [results];
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

// Initialize database tables
async function initializeDatabase() {
    try {
        const connection = await getConnection();
        
        // Create tables
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                password VARCHAR(255) NOT NULL,
                role ENUM('user', 'admin', 'instructor') DEFAULT 'user',
                avatar_url VARCHAR(500),
                bio TEXT,
                xp INT DEFAULT 0,
                level INT DEFAULT 1,
                streak INT DEFAULT 0,
                last_active DATETIME DEFAULT NULL,
                email_verified BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_email (email(191)),
                INDEX idx_email (email(191)),
                INDEX idx_role (role),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
    CREATE TABLE IF NOT EXISTS courses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        short_description VARCHAR(500),
        category VARCHAR(100),
        difficulty ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
        price DECIMAL(10, 2) DEFAULT 0.00,
        discounted_price DECIMAL(10, 2),
        thumbnail_url VARCHAR(500),
        video_url VARCHAR(500),
        duration INT DEFAULT 0,
        rating DECIMAL(3, 2) DEFAULT 0.00,
        total_ratings INT DEFAULT 0,
        total_students INT DEFAULT 0,
        is_featured BOOLEAN DEFAULT FALSE,
        is_published BOOLEAN DEFAULT TRUE,
        instructor_id INT NULL,
        created_at DATETIME DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_courses_instructor
            FOREIGN KEY (instructor_id)
            REFERENCES users(id)
            ON DELETE SET NULL,
        UNIQUE KEY unique_course_slug (slug(191)),
        INDEX idx_slug (slug(191)),
        INDEX idx_title (title(191)),
        INDEX idx_category (category),
        INDEX idx_difficulty (difficulty),
        INDEX idx_is_published (is_published)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci;`);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_courses (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                course_id INT NOT NULL,
                progress INT DEFAULT 0,
                completed BOOLEAN DEFAULT FALSE,
                current_lesson_id INT,
                started_at DATETIME DEFAULT NULL,
                completed_at DATETIME,
                last_accessed DATETIME DEFAULT NULL,
                rating INT,
                review TEXT,
                UNIQUE KEY unique_user_course (user_id, course_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_course_id (course_id),
                INDEX idx_completed (completed)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS lessons (
                id INT PRIMARY KEY AUTO_INCREMENT,
                course_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL,
                content LONGTEXT,
                video_url VARCHAR(500),
                duration INT DEFAULT 0,
                sort_order INT DEFAULT 0,
                is_free BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                UNIQUE KEY unique_course_lesson (course_id, slug(191)),
                INDEX idx_course_id (course_id),
                INDEX idx_sort_order (sort_order)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS certificates (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                course_id INT NOT NULL,
                certificate_id VARCHAR(100) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                course_title VARCHAR(255) NOT NULL,
                issue_date DATETIME DEFAULT NULL,
                expiry_date DATETIME,
                download_url VARCHAR(500),
                verification_url VARCHAR(500),
                is_verified BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_certificate_id (certificate_id),
                INDEX idx_issue_date (issue_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`    CREATE TABLE IF NOT EXISTS projects (        id INT PRIMARY KEY AUTO_INCREMENT,        user_id INT NOT NULL,        title VARCHAR(191) NOT NULL,        slug VARCHAR(191) NOT NULL,        description TEXT,        thumbnail_url VARCHAR(500),        github_url VARCHAR(500),        live_url VARCHAR(500),        tags TEXT,        status ENUM('planning', 'in_progress', 'completed', 'archived')            DEFAULT 'planning',        progress INT DEFAULT 0,        is_public BOOLEAN DEFAULT TRUE,        views_count INT DEFAULT 0,        likes_count INT DEFAULT 0,        collaborators TEXT,        started_at DATETIME DEFAULT NULL,        completed_at DATETIME,        created_at DATETIME DEFAULT NULL,        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP            ON UPDATE CURRENT_TIMESTAMP,        FOREIGN KEY (user_id)            REFERENCES users(id)            ON DELETE CASCADE,        INDEX idx_user_id (user_id),        INDEX idx_status (status),        UNIQUE KEY unique_project_slug (slug(191)),        INDEX idx_slug (slug(191))    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                type ENUM('info', 'success', 'warning', 'error', 'course', 'certificate', 'project', 'payment', 'system') DEFAULT 'info',
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                icon VARCHAR(50),
                data TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT NULL,
                read_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_is_read (is_read),
                INDEX idx_created_at (created_at),
                INDEX idx_type (type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                course_id INT,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'USD',
                status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
                payment_method VARCHAR(50),
                payment_gateway VARCHAR(50),
                transaction_id VARCHAR(100) UNIQUE,
                gateway_response TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_status (status),
                INDEX idx_transaction_id (transaction_id),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_skills (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                skill_name VARCHAR(100) NOT NULL,
                skill_level INT DEFAULT 0,
                experience_years DECIMAL(3, 1) DEFAULT 0,
                projects_count INT DEFAULT 0,
                is_verified BOOLEAN DEFAULT FALSE,
                verified_by INT,
                verified_at DATETIME,
                created_at DATETIME DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE KEY unique_user_skill (user_id, skill_name),
                INDEX idx_user_id (user_id),
                INDEX idx_skill_name (skill_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                icon VARCHAR(50),
                points INT DEFAULT 0,
                category VARCHAR(50),
                earned_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_category (category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS activities (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                type ENUM('course_started', 'course_completed', 'certificate_earned', 'project_created', 'project_completed', 'payment_made', 'skill_added', 'achievement_earned', 'login', 'profile_updated') NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                reference_id INT,
                reference_type VARCHAR(50),
                metadata TEXT,
                created_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_type (type),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS email_otps (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                otp VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_otp (otp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                response TEXT,
                is_ai BOOLEAN DEFAULT FALSE,
                tokens_used INT DEFAULT 0,
                model VARCHAR(50),
                created_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_created_at (created_at),
                INDEX idx_is_ai (is_ai)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                session_token VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                expires_at DATETIME NOT NULL,
                last_activity DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                UNIQUE KEY unique_session_token (session_token(191)),
                INDEX idx_session_token (session_token(191)),
                INDEX idx_expires_at (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS course_categories (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                icon VARCHAR(50),
                color VARCHAR(20),
                sort_order INT DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT NULL,
                INDEX idx_slug (slug),
                INDEX idx_is_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Quizzes and CBT tables
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS quizzes (
                id INT PRIMARY KEY AUTO_INCREMENT,
                course_id INT NOT NULL,
                lesson_id INT DEFAULT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                passing_score INT DEFAULT 70,
                time_limit_minutes INT DEFAULT 0,
                shuffle_questions BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                INDEX idx_course_id (course_id),
                INDEX idx_lesson_id (lesson_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS quiz_questions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                quiz_id INT NOT NULL,
                question_text TEXT NOT NULL,
                question_type ENUM('single', 'multiple', 'short') DEFAULT 'single',
                points INT DEFAULT 1,
                sort_order INT DEFAULT 0,
                created_at DATETIME DEFAULT NULL,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
                INDEX idx_quiz_id (quiz_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS quiz_choices (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question_id INT NOT NULL,
                text TEXT NOT NULL,
                is_correct BOOLEAN DEFAULT FALSE,
                sort_order INT DEFAULT 0,
                FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
                INDEX idx_question_id (question_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_quiz_attempts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                quiz_id INT NOT NULL,
                score INT DEFAULT 0,
                passed BOOLEAN DEFAULT FALSE,
                started_at DATETIME DEFAULT NULL,
                completed_at DATETIME DEFAULT NULL,
                time_taken_seconds INT DEFAULT 0,
                metadata TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_quiz_id (quiz_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_quiz_answers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                attempt_id INT NOT NULL,
                question_id INT NOT NULL,
                choice_id INT,
                answer_text TEXT,
                is_correct BOOLEAN DEFAULT FALSE,
                points_awarded INT DEFAULT 0,
                FOREIGN KEY (attempt_id) REFERENCES user_quiz_attempts(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
                FOREIGN KEY (choice_id) REFERENCES quiz_choices(id) ON DELETE SET NULL,
                INDEX idx_attempt_id (attempt_id),
                INDEX idx_question_id (question_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Insert default categories
        const categories = [
            ['Web Development', 'web-development', 'Learn to build modern websites and web applications', 'code', '#FF003C', 1],
            ['Mobile Development', 'mobile-development', 'Build iOS and Android applications', 'mobile', '#00D4FF', 2],
            ['Data Science', 'data-science', 'Master data analysis and machine learning', 'chart-line', '#9D00FF', 3],
            ['DevOps', 'devops', 'Learn deployment and infrastructure management', 'server', '#00FF9D', 4],
            ['UI/UX Design', 'ui-ux-design', 'Design beautiful user interfaces', 'paint-brush', '#FFD700', 5],
            ['Cybersecurity', 'cybersecurity', 'Learn to protect systems and networks', 'shield-alt', '#FF6B6B', 6]
        ];

        for (const [name, slug, description, icon, color, order] of categories) {
            await connection.execute(
                'INSERT IGNORE INTO course_categories (name, slug, description, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [name, slug, description, icon, color, order]
            );
        }

        // Create admin user if not exists
        const adminEmail = process.env.ADMIN_EMAIL || 'tumicodes@gmail.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'tumicodes25';
        
        const [existingAdmin] = await connection.execute(
            'SELECT id FROM users WHERE email = ?',
            [adminEmail]
        );

        if (existingAdmin.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            
            await connection.execute(
                'INSERT INTO users (email, name, password, role, email_verified) VALUES (?, ?, ?, ?, ?)',
                [adminEmail, 'TumiCodes Admin', hashedPassword, 'admin', true]
            );
            
            const [adminUser] = await connection.execute(
                'SELECT id FROM users WHERE email = ?',
                [adminEmail]
            );
            
            // Add admin achievements
            await connection.execute(
                'INSERT INTO achievements (user_id, name, description, icon, points, category) VALUES (?, ?, ?, ?, ?, ?)',
                [adminUser[0].id, 'Founding Member', 'Joined TumiCodes as an admin', 'crown', 1000, 'special']
            );
            
            console.log('✅ Admin user created successfully');
        }

        // Insert sample courses if none exist
        const [courseCount] = await connection.execute('SELECT COUNT(*) as count FROM courses');
        if (courseCount[0].count === 0) {
            const sampleCourses = [
                [
                    'Complete Web Development Bootcamp 2024',
                    'web-development-bootcamp-2024',
                    'Learn web development from scratch. HTML, CSS, JavaScript, React, Node.js, MongoDB and more!',
                    'Become a full-stack web developer with this comprehensive course',
                    'web-development',
                    'beginner',
                    99.99,
                    79.99,
                    'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
                    'https://youtube.com/embed/sample',
                    4800,
                    4.8,
                    1250,
                    5000,
                    true,
                    true,
                    null
                ],
                [
                    'Machine Learning for Beginners',
                    'machine-learning-beginners',
                    'Start your journey into machine learning with Python',
                    'Learn the fundamentals of machine learning and AI',
                    'data-science',
                    'beginner',
                    89.99,
                    69.99,
                    'https://images.unsplash.com/photo-1555949963-aa79dcee981c',
                    'https://youtube.com/embed/sample2',
                    3600,
                    4.7,
                    890,
                    3200,
                    true,
                    true,
                    null
                ],
                [
                    'Advanced React Patterns',
                    'advanced-react-patterns',
                    'Master advanced React concepts and patterns',
                    'Take your React skills to the next level',
                    'web-development',
                    'advanced',
                    79.99,
                    59.99,
                    'https://images.unsplash.com/photo-1633356122544-f134324a6cee',
                    'https://youtube.com/embed/sample3',
                    1800,
                    4.9,
                    450,
                    1800,
                    false,
                    true,
                    null
                ]
            ];

            for (const course of sampleCourses) {
                await connection.execute(
                    `INSERT INTO courses (
                        title, slug, description, short_description, category, difficulty, 
                        price, discounted_price, thumbnail_url, video_url, duration, 
                        rating, total_ratings, total_students, is_featured, is_published, instructor_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    course
                );
            }
            console.log('✅ Sample courses created');
        }

        console.log('✅ Database tables created successfully');
        connection.release();
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

module.exports = {
    pool,
    createPool,
    getConnection,
    executeQuery,
    initializeDatabase
};

// Close the pool gracefully
async function closePool() {
    try {
        if (pool && pool.end) {
            await pool.end();
            console.log('✅ Database pool closed');
        }
    } catch (error) {
        console.error('Error closing database pool:', error);
    }
}

module.exports.closePool = closePool;