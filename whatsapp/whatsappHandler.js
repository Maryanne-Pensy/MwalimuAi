// backend/whatsapp/whatsappHandler.js
// -------------------------------

const twilio = require('twilio');
const {
  detectIntent,
  extractStudentName,
  generatePerformanceReport,
  generateQuiz,
  parseGradeRecording,
  formatGradeFeedback,
  parseStudentRegistration,
  parseTeacherRegistration,
  parseParentRegistration,
  extractSubject
} = require('../ai/aiHandler');

const { findStudentByName, recordQuizScore, recordGrades } = require('../utils/database');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const DEFAULT_TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';

// ------------------------
// UTILITIES
// ------------------------
function normalizeWhatsAppNumber(raw) {
  if (!raw) return null;
  if (raw.startsWith('whatsapp:')) return raw;
  if (raw.startsWith('+')) return `whatsapp:${raw}`;
  const digitsOnly = raw.replace(/\s|-/g, '');
  if (/^\d+$/.test(digitsOnly)) return `whatsapp:+${digitsOnly}`;
  return null;
}

function getConfiguredFromNumber() {
  const configured = process.env.TWILIO_WHATSAPP_NUMBER;
  if (configured && configured.startsWith('whatsapp:')) return configured;
  if (configured && configured.startsWith('+')) return `whatsapp:${configured}`;
  return DEFAULT_TWILIO_WHATSAPP_NUMBER;
}

async function sendWhatsAppMessage(to, message, opts = {}) {
  const toNormalized = normalizeWhatsAppNumber(to);
  const fromNumber = opts.fromOverride ? normalizeWhatsAppNumber(opts.fromOverride) : getConfiguredFromNumber();
  const response = await client.messages.create({ from: fromNumber, to: toNormalized, body: message });
  return response;
}

async function sendWhatsAppMessageWithRetry(to, message, retries = 2) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await sendWhatsAppMessage(to, message); } 
    catch (err) { lastErr = err; if (attempt === retries) throw lastErr; await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt))); }
  }
}

// ------------------------
// QUIZ SESSIONS
// ------------------------
const quizSessions = {};

async function startQuiz(phoneNumber, subject) {
  const quizText = await generateQuiz(subject, 3);
  const questions = quizText.split(/Question \d+: /).slice(1).map(q => {
    const lines = q.split('\n').filter(l => l.trim());
    const qText = lines[0];
    const options = lines.slice(1, 5);
    const answerLine = lines.find(l => l.toLowerCase().startsWith('correct answers')) || '';
    const answerMatch = answerLine.match(/(\d)-([A-D])/gi);
    const correctAnswer = answerMatch && answerMatch[0] ? answerMatch[0].split('-')[1].toUpperCase() : 'A';
    return { q: qText, options, answer: correctAnswer };
  });
  quizSessions[phoneNumber] = { subject, questions, answersGiven: [] };
  return questions;
}

function answerQuiz(phoneNumber, answer) {
  const session = quizSessions[phoneNumber];
  if (!session) return { finished: true, message: "❌ No active quiz found." };
  const currentIndex = session.answersGiven.length;
  const currentQuestion = session.questions[currentIndex];
  const isCorrect = answer.trim().toUpperCase() === currentQuestion.answer.toUpperCase();
  session.answersGiven.push({ given: answer, correct: currentQuestion.answer });

  let feedback = isCorrect ? "✅ Correct!" : `❌ Wrong! Correct answer: ${currentQuestion.answer}`;
  const finished = session.answersGiven.length === session.questions.length;

  if (finished) {
    const totalCorrect = session.answersGiven.filter(a => a.given.toUpperCase() === a.correct.toUpperCase()).length;
    feedback += `\n🎉 Quiz finished! Score: ${totalCorrect}/${session.questions.length}`;
    if (recordQuizScore) recordQuizScore(phoneNumber, session.subject, totalCorrect);
    delete quizSessions[phoneNumber];
  }

  return { finished, message: feedback };
}

// ------------------------
// WHATSAPP HANDLER
// ------------------------
async function whatsappWebhookHandler(req, res) {
  try {
    const from = req.body?.From || req.body?.from || req.query?.From;
    const body = req.body?.Body || req.body?.body || req.query?.Body || '';
    const senderNormalized = from && from.startsWith('whatsapp:') ? from : normalizeWhatsAppNumber(from);

    // Quiz handling
    if (quizSessions[senderNormalized]) {
      const { message } = answerQuiz(senderNormalized, body);
      await sendWhatsAppMessageWithRetry(senderNormalized, message);
      return res.status(200).send('OK');
    }

    const intent = await detectIntent(body);
    let replyText = '';

    switch (intent) {
      case 'REGISTER_STUDENT': {
        const parsed = parseStudentRegistration(body);
        replyText = parsed ? `✅ Student registered: ${parsed.name}, ${parsed.class}` : "Send: Register student: Name, Class, +ParentPhone";
        break;
      }
      case 'REGISTER_TEACHER': {
        const parsed = parseTeacherRegistration(body);
        replyText = parsed ? `✅ Teacher registered: ${parsed.name}` : "Send: Register teacher: Name, Subject(s)";
        break;
      }
      case 'REGISTER_PARENT': {
        const parsed = parseParentRegistration(body);
        replyText = parsed ? `✅ Parent registered: ${parsed.name}, Child: ${parsed.childName}` : "Send: Register parent: Name, Phone, for Child Name";
        break;
      }
      case 'CHECK_PERFORMANCE': {
        const studentName = extractStudentName(body);
        const student = studentName ? await findStudentByName(studentName) : null;
        replyText = generatePerformanceReport(student);
        break;
      }
      case 'QUIZ_REQUEST': {
        const subject = extractSubject(body);
        const questions = await startQuiz(senderNormalized, subject);
        const firstQ = questions[0];
        replyText = `📝 Quiz (${subject}) - Question 1:\n${firstQ.q}\n${firstQ.options.join('\n')}`;
        break;
      }
      case 'QUIZ_ANSWER':
  console.log('✅ Processing quiz answer submission...');
  const answerPhone = from.replace('whatsapp:', '');
  
  // Check if there's an active quiz session
  const activeSession = getActiveQuizSession(answerPhone);
  if (!activeSession) {
    // Not a quiz answer, might be something else
    response = "❌ No active quiz found. Send 'Quiz me on Math' to start a new quiz!";
    break;
  }
  
  // Parse user's answers
  const userAnswers = parseQuizAnswers(incomingMessage);
  console.log(`   Parsed answers: ${userAnswers.join(', ')}`);
  
  // Grade the quiz
  const gradingResult = gradeQuizAnswers(answerPhone, userAnswers);
  
  if (!gradingResult.success) {
    response = gradingResult.message;
  } else {
    const percentage = gradingResult.score;
    const emoji = percentage >= 80 ? '🎉' : percentage >= 60 ? '👍' : '💪';
    
    response = `${emoji} *QUIZ RESULTS*\n${'━'.repeat(20)}\n\n`;
    response += `📊 *Score:* ${gradingResult.correctCount}/${gradingResult.totalQuestions} (${percentage}%)\n\n`;
    response += `*Answer Breakdown:*\n`;
    
    gradingResult.results.forEach(r => {
      const icon = r.isCorrect ? '✅' : '❌';
      response += `${icon} Question ${r.questionNumber}: ${r.userAnswer}`;
      if (!r.isCorrect) {
        response += ` (Correct: ${r.correctAnswer})`;
      }
      response += '\n';
    });
    
    // Add performance feedback
    if (percentage >= 80) {
      response += `\n🌟 Excellent work! You're mastering ${gradingResult.subject}!`;
    } else if (percentage >= 60) {
      response += `\n👍 Good job! Keep practicing to improve further.`;
    } else {
      response += `\n💪 Keep trying! Practice makes perfect. Request another quiz to improve!`;
    }
    
    // TODO: Save quiz score to student record (optional enhancement)
  }
  break;
  
      case 'RECORD_GRADES': {
        const records = parseGradeRecording(body);
        if (records.length === 0) replyText = "❌ Could not parse grades. Use: Name Subject Score or Name Subject Score/Total";
        else {
          if (recordGrades) for (const r of records) await recordGrades(r.studentName, r.subject, r.score, r.total);
          replyText = `✅ Grades recorded:\n${formatGradeFeedback(records)}`;
        }
        break;
      }
      default:
        replyText = "Hi! I can handle registration, quizzes, grades, attendance.";
    }

    await sendWhatsAppMessageWithRetry(senderNormalized, replyText);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    res.status(500).send('Server Error');
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppMessageWithRetry,
  whatsappWebhookHandler
};
