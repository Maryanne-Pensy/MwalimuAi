require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import our modules
const { 
  detectIntent, 
  extractStudentName, 
  generatePerformanceReport,
  generateQuiz,
  parseGradeRecording,
  extractSubject,
  parseStudentRegistration,
  parseTeacherRegistration,
  parseParentRegistration
} = require('./ai/aiHandler');

const { 
  findStudentByName, 
  addGrade,
  getClassStats,
  getAllStudents
} = require('./utils/database');

const { 
  registerStudent,
  registerTeacher,
  registerParent,
  getUserByPhone
} = require('./utils/registration');

const { sendWhatsAppMessage } = require('./whatsapp/whatsappHandler');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // For Twilio webhooks


// ============================================
// QUIZ SESSION STORAGE (In-Memory)
// ============================================
const quizSessions = {}; // { phoneNumber: { subject, questions, correctAnswers, createdAt } }

// Helper: Create quiz session
function createQuizSession(phone, subject, quizText, correctAnswers) {
  quizSessions[phone] = {
    subject: subject,
    quizText: quizText,
    correctAnswers: correctAnswers,
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes
  };
  console.log(`📝 Quiz session created for ${phone}: ${subject}`);
}

// Helper: Get active quiz session
function getActiveQuizSession(phone) {
  const session = quizSessions[phone];
  if (!session) return null;
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    delete quizSessions[phone];
    return null;
  }
  
  return session;
}

// Helper: Parse user answers from message
function parseQuizAnswers(message) {
  const msg = message.toUpperCase().trim();
  
  // Pattern 1: "1A 2C 3B"
  const pattern1 = /\d+([A-D])/g;
  let matches = [...msg.matchAll(pattern1)];
  if (matches.length > 0) {
    return matches.map(m => m[1]);
  }
  
  // Pattern 2: "A C B" or "A, C, B"
  const pattern2 = /[A-D]/g;
  matches = msg.match(pattern2);
  if (matches && matches.length >= 2) {
    return matches;
  }
  
  return [];
}

// Helper: Grade quiz answers
function gradeQuizAnswers(phone, userAnswers) {
  const session = getActiveQuizSession(phone);
  
  if (!session) {
    return {
      success: false,
      message: "❌ No active quiz found. Please request a new quiz first."
    };
  }
  
  if (userAnswers.length !== session.correctAnswers.length) {
    return {
      success: false,
      message: `❌ Please provide ${session.correctAnswers.length} answers.\n\n*Format:* 1A 2C 3B\n*Or:* A C B`
    };
  }
  
  // Grade each answer
  let correctCount = 0;
  const results = [];
  
  userAnswers.forEach((answer, index) => {
    const isCorrect = answer.toUpperCase() === session.correctAnswers[index].toUpperCase();
    if (isCorrect) correctCount++;
    
    results.push({
      questionNumber: index + 1,
      userAnswer: answer.toUpperCase(),
      correctAnswer: session.correctAnswers[index].toUpperCase(),
      isCorrect: isCorrect
    });
  });
  
  const score = Math.round((correctCount / session.correctAnswers.length) * 100);
  
  // Remove session after grading
  delete quizSessions[phone];
  
  return {
    success: true,
    score: score,
    correctCount: correctCount,
    totalQuestions: session.correctAnswers.length,
    results: results,
    subject: session.subject
  };
}

// Helper: Extract correct answers from quiz text
function extractCorrectAnswers(quizText) {
  // Look for patterns like "CORRECT ANSWERS: 1-A, 2-C, 3-B" or similar
  const patterns = [
    /CORRECT\s+ANSWERS?:?\s*(\d+[-:]?\s*[A-D](?:\s*,\s*\d+[-:]?\s*[A-D])*)/i,
    /ANSWERS?:?\s*(\d+[-:]?\s*[A-D](?:\s*,\s*\d+[-:]?\s*[A-D])*)/i
  ];
  
  for (const pattern of patterns) {
    const match = quizText.match(pattern);
    if (match) {
      // Extract individual answers
      const answerPattern = /\d+[-:]?\s*([A-D])/gi;
      const answers = [];
      let answerMatch;
      
      while ((answerMatch = answerPattern.exec(match[0])) !== null) {
        answers.push(answerMatch[1].toUpperCase());
      }
      
      if (answers.length > 0) {
        return answers;
      }
    }
  }
  
  return [];
}
// Serve demo page
app.use(express.static('public'));

app.get('/demo', (req, res) => {
  res.sendFile(__dirname + '/public/demo.html');
});
// ============================================
// WHATSAPP WEBHOOK - Main entry point
// ============================================
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const incomingMessage = req.body.Body || '';
    const from = req.body.From; // Format: whatsapp:+254XXXXXXXXX
    const senderName = req.body.ProfileName || 'User';

    console.log('\n' + '='.repeat(50));
    console.log(`📱 NEW WHATSAPP MESSAGE`);
    console.log(`From: ${senderName} (${from})`);
    console.log(`Message: "${incomingMessage}"`);
    console.log('='.repeat(50));

    if (!incomingMessage) {
      await sendWhatsAppMessage(from, '❌ Empty message received. Please try again.');
      return res.status(200).send('OK');
    }

    // Detect user intent with AI
    const intent = await detectIntent(incomingMessage);
    console.log(`🎯 Intent: ${intent}`);

    let response = '';

    // Handle different intents
    switch (intent) {
      case 'REGISTER_STUDENT':
        console.log('📝 Processing student registration...');
        const studentData = parseStudentRegistration(incomingMessage);
        
        if (!studentData) {
          response = `❌ *Invalid format*\n\n*To register a student, use:*\n"Register student: Name, Class, Parent Phone"\n\n*Example:*\nRegister student: Amina Hassan, Form 2A, +254712345678`;
        } else {
          // Use sender's phone as student phone
          const studentPhone = from.replace('whatsapp:', '');
          const result = registerStudent(
            studentData.name,
            studentPhone,
            studentData.class,
            studentData.parentPhone
          );
          response = result.message;
        }
        break;

      case 'REGISTER_TEACHER':
        console.log('👨‍🏫 Processing teacher registration...');
        const teacherData = parseTeacherRegistration(incomingMessage);
        
        if (!teacherData) {
          response = `❌ *Invalid format*\n\n*To register as a teacher, use:*\n"Register teacher: Name, Subject(s)"\n\n*Example:*\nRegister teacher: Mr. John Kamau, Mathematics`;
        } else {
          // Use sender's phone as teacher phone
          const teacherPhone = from.replace('whatsapp:', '');
          const result = registerTeacher(
            teacherData.name,
            teacherPhone,
            teacherData.subjects,
            [] // Classes will be assigned later
          );
          response = result.message;
        }
        break;

      case 'REGISTER_PARENT':
        console.log('👨‍👩‍👧 Processing parent registration...');
        const parentData = parseParentRegistration(incomingMessage);
        
        if (!parentData) {
          response = `❌ *Invalid format*\n\n*To register as a parent, use:*\n"Register parent: Your Name, Your Phone, for Child Name"\n\n*Example:*\nRegister parent: Mrs. Fatuma Hassan, +254712345678, for Amina Hassan`;
        } else {
          // Use sender's phone if not provided
          const parentPhone = parentData.phone || from.replace('whatsapp:', '');
          const parentName = parentData.name || 'Parent'; // Will ask for name if not provided
          
          const result = registerParent(
            parentName,
            parentPhone,
            parentData.childName
          );
          response = result.message;
        }
        break;

      case 'CHECK_PERFORMANCE':
        console.log('📊 Processing performance check...');
        const studentName = extractStudentName(incomingMessage);
        console.log(`   Student name extracted: ${studentName}`);
        
        const student = findStudentByName(studentName);
        response = generatePerformanceReport(student);
        break;

      case 'QUIZ_REQUEST':
        console.log('📝 Processing quiz request...');
        const subject = extractSubject(incomingMessage);
        console.log(`   Subject: ${subject}`);
        
        response = await generateQuiz(subject, 3);
        response = `📝 *${subject.toUpperCase()} QUIZ*\n${'━'.repeat(20)}\n\n${response}\n\n💡 *Reply with your answers*\nFormat: 1A 2C 3B`;
        break;

      case 'RECORD_GRADES':
        console.log('✍️ Processing grade recording...');
        const gradeRecords = parseGradeRecording(incomingMessage);
        
        if (gradeRecords.length === 0) {
          response = `❌ *Could not parse grades*\n\n*Format:*\nRecord grades: Name Subject Score\n\n*Example:*\nRecord grades: Amina Math 85, John English 78`;
        } else {
          let recordedCount = 0;
          let failedRecords = [];
          
          for (const record of gradeRecords) {
            const updated = addGrade(record.studentName, record.subject, record.score);
            if (updated) {
              recordedCount++;
            } else {
              failedRecords.push(record.studentName);
            }
          }
          
          response = `✅ *GRADES RECORDED*\n${'━'.repeat(20)}\n\n`;
          response += `Successfully recorded: *${recordedCount}* grade(s)\n\n`;
          
          gradeRecords.forEach(r => {
            const emoji = failedRecords.includes(r.studentName) ? '❌' : '✅';
            response += `${emoji} ${r.studentName}: ${r.subject} = ${r.score}/100\n`;
          });
          
          if (failedRecords.length > 0) {
            response += `\n⚠️ *Failed:* ${failedRecords.join(', ')} (student not found)`;
          }
        }
        break;

      case 'CLASS_STATS':
        console.log('📊 Processing class stats request...');
        const stats = getClassStats();
        
        response = `📊 *CLASS STATISTICS*\n${'━'.repeat(20)}\n\n`;
        response += `👥 Total Students: *${stats.totalStudents}*\n\n`;
        response += `📚 *Subject Averages:*\n`;
        
        Object.keys(stats.subjectAverages).forEach(subject => {
          response += `• ${subject}: ${stats.subjectAverages[subject]}%\n`;
        });
        break;

      case 'HELP':
      default:
        console.log('ℹ️ Sending help message...');
        
        // Check if user is already registered
        const userPhone = from.replace('whatsapp:', '');
        const user = getUserByPhone(userPhone);
        
        if (user.type !== 'unknown') {
          response = `👋 *Welcome back, ${user.data.name}!*\n${'━'.repeat(20)}\n\n`;
          response += `You're registered as: *${user.type.toUpperCase()}*\n\n`;
        } else {
          response = `👋 *Welcome to Mwalimu AI!*\n${'━'.repeat(20)}\n\n`;
          response += `🆕 *NEW USER?* Register first:\n\n`;
          response += `📝 *Students:*\n"Register student: Name, Class, Parent Phone"\n\n`;
          response += `👨‍🏫 *Teachers:*\n"Register teacher: Name, Subject"\n\n`;
          response += `👨‍👩‍👧 *Parents:*\n"Register parent: Name, Phone, for Child"\n\n`;
          response += `${'━'.repeat(20)}\n\n`;
        }
        
        response += `*I can help with:*\n\n📊 *For Parents:*\n"Check [name] performance"\n"Show [name] grades"\n\n📝 *For Students:*\n"Quiz me on Math"\n"Practice Science questions"\n\n✍️ *For Teachers:*\n"Record grades: Name Subject Score"\n\n📈 *For Admins:*\n"Show class statistics"\n\n💡 *Just send me a message!*`;
    }

    // Send response back to user
    console.log(`📤 Sending response (${response.length} chars)...`);
    await sendWhatsAppMessage(from, response);
    console.log('✅ Response sent successfully!\n');

    // Respond to Twilio (required to acknowledge webhook)
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ WEBHOOK ERROR:', error);
    
    try {
      await sendWhatsAppMessage(
        req.body.From,
        '❌ Sorry, I encountered an error processing your message. Please try again or contact support.'
      );
    } catch (sendError) {
      console.error('❌ Failed to send error message:', sendError);
    }
    
    res.status(500).send('Error');
  }
});

// ============================================
// TEST API ENDPOINT (for testing without WhatsApp)
// ============================================
app.post('/api/message', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    console.log(`📩 API Test: "${message}" from ${userId}`);
    
    const intent = await detectIntent(message);
    let response = '';
    
    switch (intent) {
      case 'CHECK_PERFORMANCE':
        const studentName = extractStudentName(message);
        const student = findStudentByName(studentName);
        response = generatePerformanceReport(student);
        break;
        
      case 'QUIZ_REQUEST':
        const subject = extractSubject(message);
        response = await generateQuiz(subject);
        break;
        
      case 'RECORD_GRADES':
        const gradeRecords = parseGradeRecording(message);
        if (gradeRecords.length === 0) {
          response = "Format: 'Record grades: Name Subject Score'";
        } else {
          let recordedCount = 0;
          for (const record of gradeRecords) {
            const updated = addGrade(record.studentName, record.subject, record.score);
            if (updated) recordedCount++;
          }
          response = `✅ Recorded ${recordedCount} grade(s)`;
        }
        break;
        
      default:
        response = 'Welcome to Mwalimu AI!';
    }
    
    res.json({ success: true, response, intent });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Mwalimu AI Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// GET ALL STUDENTS (for testing)
// ============================================
app.get('/api/students', (req, res) => {
  try {
    const students = getAllStudents();
    res.json({ success: true, students, count: students.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MWALIMU AI - BACKEND SERVER STARTED');
  console.log('='.repeat(60));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📱 WhatsApp webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`👥 Students API: http://localhost:${PORT}/api/students`);
  console.log('='.repeat(60));
  console.log('✅ Ready to receive messages!\n');
});