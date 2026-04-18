/**
 * نظام إدارة جامعة كلكامش - السيرفر الرئيسي (Backend)
 * تم التعديل للعمل مع سحابة Aiven و Render
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors());

// تسليم ملفات الواجهة (مهم جداً للـ Render)
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// --- 1. الاتصال بقاعدة البيانات (نظام الـ Pool لضمان استقرار الربط) ---
const db = mysql.createPool({
    host: 'mysql-37412ec6-gaueng.l.aivencloud.com',
    port: 12740,
    user: 'avnadmin',
    password: 'AVNS_GatFmA-TfMR5SbWNdM-',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// تهيئة الجداول تلقائياً
const initDB = () => {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(255), email VARCHAR(255) UNIQUE, password VARCHAR(255), role ENUM('student', 'doctor'), academic_level VARCHAR(50))`,
        `CREATE TABLE IF NOT EXISTS lectures (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), file_path VARCHAR(255), target_level VARCHAR(50), doctor_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE)`,
        `CREATE TABLE IF NOT EXISTS quizzes (id INT AUTO_INCREMENT PRIMARY KEY, lecture_id INT, question TEXT, option_a VARCHAR(255), option_b VARCHAR(255), option_c VARCHAR(255), option_d VARCHAR(255), correct_option CHAR(1), FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE)`,
        `CREATE TABLE IF NOT EXISTS quiz_results (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT, quiz_id INT, score INT, total INT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE)`
    ];
    queries.forEach(q => db.query(q));
    console.log("✅ Database structure is ready!");
};
initDB();

// --- 2. إعدادات رفع الملفات ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- 3. المسارات (Routes) ---

// الصفحة الرئيسية
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'guaeng.html')));

// التسجيل
app.post('/register', async (req, res) => {
    const { full_name, email, password, role, academic_level } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (full_name, email, password, role, academic_level) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [full_name, email, hashedPassword, role, academic_level], (err) => {
        if (err) return res.status(500).send({ message: "خطأ: " + err.message });
        res.send({ message: "تم إنشاء الحساب بنجاح!" });
    });
});

// الدخول
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send({ message: "المستخدم غير موجود" });
        const match = await bcrypt.compare(password, results[0].password);
        if (match) res.send({ user: results[0] });
        else res.status(401).send({ message: "كلمة المرور خاطئة" });
    });
});

// رفع محاضرة
app.post('/upload', upload.single('lectureFile'), (req, res) => {
    const { title, target_level, doctor_id } = req.body;
    const sql = "INSERT INTO lectures (title, file_path, target_level, doctor_id) VALUES (?, ?, ?, ?)";
    db.query(sql, [title, req.file.path, target_level, doctor_id], (err) => {
        if (err) return res.status(500).send({ message: "فشل الحفظ" });
        res.send({ message: "تم النشر بنجاح!" });
    });
});

// جلب المحاضرات للطالب
app.get('/get-lectures/:level', (req, res) => {
    db.query("SELECT * FROM lectures WHERE target_level = ? OR target_level = 'all' ORDER BY id DESC", [req.params.level], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
