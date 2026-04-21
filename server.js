/**
 * نظام إدارة جامعة كلكامش - النسخة النهائية المستقرة
 * تشمل: (المستخدمين، المحاضرات، الكويزات، النتائج، والرفع السحابي)
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');    

// --- إعدادات السحابة والمجلدات ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("✅ تم إنشاء مجلد uploads بنجاح!");
}

const app = express();

// --- إعدادات السحابة والمجلدات ---
app.use(express.json());
app.use(cors());

// التأكد من وجود مجلد الرفع برمجياً (حل مشكلة فشل الرفع)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// --- 1. الاتصال بقاعدة بيانات Aiven (استخدام Pool للاستقرار) ---
const db = mysql.createPool({
    host: 'mysql-37412ec6-gaueng.l.aivencloud.com',
    port: 12740,
    user: 'avnadmin',
    password: 'AVNS_GatFmA-TfMR5SbWNdM-',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10
});

// إنشاء الجداول تلقائياً (نفس هيكلية كودك القديم)
const initDB = () => {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role ENUM('student', 'doctor') NOT NULL, academic_level VARCHAR(50) NULL)`,
        `CREATE TABLE IF NOT EXISTS lectures (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, file_path VARCHAR(255) NOT NULL, target_level VARCHAR(50) NOT NULL, doctor_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE)`,
        `CREATE TABLE IF NOT EXISTS quizzes (id INT AUTO_INCREMENT PRIMARY KEY, lecture_id INT, question TEXT NOT NULL, option_a VARCHAR(255), option_b VARCHAR(255), option_c VARCHAR(255), option_d VARCHAR(255), correct_option CHAR(1), FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE)`,
        `CREATE TABLE IF NOT EXISTS quiz_results (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT, quiz_id INT, score INT, total INT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE)`
    ];
    queries.forEach(q => db.query(q, (err) => { if (err) console.log("Table check:", err.message); }));
};

db.getConnection((err, conn) => {
    if (err) console.error('❌ Database Error:', err.message);
    else { console.log('✅ Connected to Aiven Cloud!'); initDB(); conn.release(); }
});

// --- 2. إعدادات Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

/* ============================================================
   3. المسارات الوظيفية (نفس كودك الأصلي تماماً)
   ============================================================ */

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'guaeng.html')));

app.post('/register', async (req, res) => {
    const { full_name, email, password, role, academic_level } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query("INSERT INTO users (full_name, email, password, role, academic_level) VALUES (?, ?, ?, ?, ?)", 
        [full_name, email, hashedPassword, role, role === 'student' ? academic_level : null], (err) => {
            if (err) return res.status(500).send({ message: "البريد مسجل مسبقاً" });
            res.send({ message: "تم إنشاء الحساب بنجاح!" });
        });
    } catch (e) { res.status(500).send({ message: "خطأ في المعالجة" }); }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send({ message: "المستخدم غير موجود" });
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) res.send({ user: { id: user.id, name: user.full_name, role: user.role, level: user.academic_level } });
        else res.status(401).send({ message: "كلمة المرور خطأ" });
    });
});

app.post('/upload', upload.single('lectureFile'), (req, res) => {
    console.log("📥 محاولة رفع ملف...");
    if (!req.file) return res.status(400).send({ message: "يرجى اختيار ملف" });
    const { title, target_level, doctor_id } = req.body;
    const filePath = req.file.path.replace(/\\/g, "/");
    db.query("INSERT INTO lectures (title, file_path, target_level, doctor_id) VALUES (?, ?, ?, ?)", 
    [title, filePath, target_level, doctor_id], (err) => {
        if (err) return res.status(500).send({ message: "فشل حفظ البيانات" });
        res.send({ message: "تم نشر المحاضرة بنجاح!" });
    });
});

app.get('/get-lectures/:level', (req, res) => {
    db.query("SELECT * FROM lectures WHERE target_level = ? OR target_level = 'all' ORDER BY id DESC", 
    [req.params.level], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

// جلب محاضرات دكتور معين
app.get('/get-lectures-by-doctor/:id', (req, res) => {
    db.query("SELECT * FROM lectures WHERE doctor_id = ? ORDER BY id DESC", [req.params.id], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

// حذف محاضرة
app.delete('/delete-lecture/:id', (req, res) => {
    db.query("DELETE FROM lectures WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send({ message: "فشل الحذف" });
        res.send({ message: "تم حذف المحاضرة نهائياً" });
    });
});

/* --- نظام الكويزات --- */
app.post('/add-quiz', (req, res) => {
    const { lecture_id, question, a, b, c, d, correct } = req.body;
    db.query("INSERT INTO quizzes (lecture_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)", 
    [lecture_id, question, a, b, c, d, correct], (err) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "تم تفعيل الكويز بنجاح!" });
    });
});

app.get('/get-quiz/:lectureId', (req, res) => {
    db.query("SELECT * FROM quizzes WHERE lecture_id = ?", [req.params.lectureId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

app.post('/submit-quiz', (req, res) => {
    const { student_id, quiz_id, score, total } = req.body;
    db.query("INSERT INTO quiz_results (student_id, quiz_id, score, total) VALUES (?, ?, ?, ?)", 
    [student_id, quiz_id, score, total], (err) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "تم إرسال النتيجة للدكتور!" });
    });
});

app.get('/get-results/:lectureId', (req, res) => {
    const sql = `SELECT users.full_name, quiz_results.score, quiz_results.submitted_at FROM quiz_results 
                 JOIN users ON quiz_results.student_id = users.id 
                 JOIN quizzes ON quiz_results.quiz_id = quizzes.id WHERE quizzes.lecture_id = ?`;
    db.query(sql, [req.params.lectureId], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على المنفذ: ${PORT}`));
