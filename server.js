/**
 * نظام إدارة جامعة كلكامش - النسخة الأصلية المحدثة للسحاب
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const app = express();

// --- إعدادات الحماية والبيانات ---
app.use(express.json());
app.use(cors());

// تسليم ملفات الواجهة الأمامية (مهم جداً للـ Render)
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// --- 1. الاتصال بقاعدة البيانات (تم تحويله إلى Pool لضمان الاستقرار) ---
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

// دالة إنشاء الجداول تلقائياً (نفس جداولك القديمة بالضبط)
const initDB = () => {
    const createTablesQueries = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('student', 'doctor') NOT NULL,
            academic_level VARCHAR(50) NULL
        )`,
        `CREATE TABLE IF NOT EXISTS lectures (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            target_level VARCHAR(50) NOT NULL,
            doctor_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS quizzes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lecture_id INT,
            question TEXT NOT NULL,
            option_a VARCHAR(255),
            option_b VARCHAR(255),
            option_c VARCHAR(255),
            option_d VARCHAR(255),
            correct_option CHAR(1),
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS quiz_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT,
            quiz_id INT,
            score INT,
            total INT,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        )`
    ];

    createTablesQueries.forEach(query => {
        db.query(query, (err) => {
            if (err) console.error("❌ تنبيه: ", err.message);
        });
    });
    console.log("✅ تم فحص وإنشاء هيكل الجداول في السحابة!");
};

// فحص الاتصال الأولي
db.getConnection((err, conn) => {
    if (err) console.error('❌ فشل الاتصال بـ Aiven: ' + err.message);
    else {
        console.log('✅ تم الاتصال بسحابة Aiven بنجاح!');
        initDB();
        conn.release();
    }
});

// --- 2. إعدادات Multer (نفس إعداداتك) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

/* ============================================================
   3. المسارات الوظيفية (بدون أي تغيير في الأسماء)
   ============================================================ */

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'guaeng.html'));
});

app.post('/register', async (req, res) => {
    const { full_name, email, password, role, academic_level } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = "INSERT INTO users (full_name, email, password, role, academic_level) VALUES (?, ?, ?, ?, ?)";
        db.query(sql, [full_name, email, hashedPassword, role, role === 'student' ? academic_level : null], (err) => {
            if (err) return res.status(500).send({ message: "خطأ: البريد الإلكتروني قد يكون مسجلاً مسبقاً" });
            res.send({ message: "تم إنشاء الحساب بنجاح!" });
        });
    } catch (e) { res.status(500).send({ message: "حدث خطأ أثناء معالجة البيانات" }); }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send({ message: "المستخدم غير موجود بالنظام" });
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            res.send({ user: { id: user.id, name: user.full_name, role: user.role, level: user.academic_level } });
        } else {
            res.status(401).send({ message: "كلمة المرور غير صحيحة" });
        }
    });
});

app.post('/upload', upload.single('lectureFile'), (req, res) => {
    if (!req.file) return res.status(400).send({ message: "يرجى اختيار ملف PDF للرفع" });
    const { title, target_level, doctor_id } = req.body;
    const filePath = req.file.path.replace(/\\/g, "/");
    db.query("INSERT INTO lectures (title, file_path, target_level, doctor_id) VALUES (?, ?, ?, ?)", [title, filePath, target_level, doctor_id], (err) => {
        if (err) return res.status(500).send({ message: "فشل حفظ بيانات المحاضرة" });
        res.send({ message: "تم نشر المحاضرة بنجاح!" });
    });
});

app.get('/get-lectures/:level', (req, res) => {
    db.query("SELECT * FROM lectures WHERE target_level = ? OR target_level = 'all' ORDER BY id DESC", [req.params.level], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

app.post('/add-quiz', (req, res) => {
    const { lecture_id, question, a, b, c, d, correct } = req.body;
    db.query("INSERT INTO quizzes (lecture_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)", [lecture_id, question, a, b, c, d, correct], (err) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "تم تفعيل الكويز لهذه المحاضرة بنجاح!" });
    });
});

// --- تشغيل السيرفر على منفذ Render ---
const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
});
